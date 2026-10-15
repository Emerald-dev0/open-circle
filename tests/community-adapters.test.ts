import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommunityTool } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import type { CommunityStore } from "../server/community-contract.js";
import { PostgresCommunityStore } from "../server/community-postgres.js";
import { RedisCommunityStore } from "../server/community-redis.js";

const execute = promisify(execFile);
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface AdapterFixture {
  store: CommunityStore;
  close(): Promise<void>;
}

function actor(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tool(id: string, url = `https://${id}.example/`, status: CommunityTool["status"] = "approved"): CommunityTool {
  return {
    id,
    name: `Tool ${id}`,
    url,
    description: "An integration-test tool.",
    category: "Development",
    source: "community",
    status,
    createdAt: 100,
  };
}

async function postgresFixture(): Promise<AdapterFixture> {
  const connectionString = process.env.COMMUNITY_TEST_DATABASE_URL!;
  const connection = new URL(connectionString);
  const host = connection.searchParams.get("host") || connection.hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "/tmp", "/var/run/postgresql"].includes(host)) {
    throw new Error("COMMUNITY_TEST_DATABASE_URL must point at local PostgreSQL.");
  }
  const database = `oc_community_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  let pool: Pool | undefined;
  let created = false;
  const close = async () => {
    try {
      await pool?.end();
    } finally {
      try {
        if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    }
  };
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    connection.pathname = `/${database}`;
    pool = new Pool({ connectionString: connection.toString(), max: 2, connectionTimeoutMillis: 5_000 });
    await pool.query(readFileSync(new URL("../migrations/002_community.sql", import.meta.url), "utf8"));
    await pool.query(readFileSync(new URL("../migrations/003_github_tool_votes.sql", import.meta.url), "utf8"));
    return { store: new PostgresCommunityStore(pool), close };
  } catch (error) {
    await close();
    throw error;
  }
}

function encodeRedisResult(value: unknown): unknown {
  if (typeof value === "string") return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(encodeRedisResult);
  return value;
}

async function redisFixture(): Promise<AdapterFixture> {
  const directory = mkdtempSync("/tmp/oc-community-redis-");
  const socket = path.join(directory, "redis.sock");
  const child = spawn("redis-server", [
    "--port", "0", "--save", "", "--appendonly", "no", "--unixsocket", socket,
    "--unixsocketperm", "700", "--dir", directory,
  ], { stdio: "ignore" });
  let spawnFailure: Error | undefined;
  child.on("error", (error) => { spawnFailure = error; });
  const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as unknown;
      if (!Array.isArray(body)) throw new Error("Invalid Redis command.");
      const pipeline = request.url === "/pipeline";
      const commands: unknown[][] = pipeline ? body : [body];
      const results: { result: unknown }[] = [];
      for (const command of commands) {
        if (!Array.isArray(command)) throw new Error("Invalid Redis pipeline.");
        const { stdout } = await execute("redis-cli", ["-s", socket, "--json", ...command.map(String)]);
        results.push({ result: encodeRedisResult(JSON.parse(stdout)) });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(pipeline ? results : results[0]));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Redis gateway failed." }));
    }
  });
  const close = async () => {
    try {
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
        rmSync(directory, { recursive: true, force: true });
      }
    }
  };
  try {
    const deadline = Date.now() + 5_000;
    while (!existsSync(socket)) {
      if (spawnFailure) throw spawnFailure;
      if (child.exitCode !== null || Date.now() > deadline) throw new Error("Isolated Redis did not start.");
      await delay(20);
    }
    await execute("redis-cli", ["-s", socket, "PING"]);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Redis gateway did not bind.");
    return { store: new RedisCommunityStore(`http://127.0.0.1:${address.port}`, "local-test"), close };
  } catch (error) {
    await close();
    throw error;
  }
}

const adapters = [
  { name: "PostgreSQL", enabled: Boolean(process.env.COMMUNITY_TEST_DATABASE_URL), create: postgresFixture },
  { name: "Redis", enabled: process.env.COMMUNITY_TEST_REDIS === "1", create: redisFixture },
];

for (const adapter of adapters) {
  describe.skipIf(!adapter.enabled)(`${adapter.name} community adapter`, () => {
    let fixture: AdapterFixture;

    beforeAll(async () => { fixture = await adapter.create(); }, 15_000);
    afterAll(async () => { await fixture?.close(); }, 15_000);

    it("keeps one signed vote per profile, switches directions and removes votes", async () => {
      const store = fixture.store;
      const target = "tool:devdocs";
      const first = actor("github:1");
      const second = actor("github:2");
      await Promise.all(Array.from({ length: 8 }, () => store.setProfileVote(target, first, 1)));
      expect(await store.setProfileVote(target, first, -1)).toEqual({ target, value: -1, count: -1 });
      expect(await store.setProfileVote(target, second, 1)).toMatchObject({ count: 0 });
      expect((await store.readProfileVotes(first)).votes[target]).toBe(-1);
      expect((await store.readProfileVotes(second)).votes[target]).toBe(1);
      expect((await store.readProfileVotes(null)).votes).toEqual({});
      await store.setProfileVote(target, first, 0);
      expect(await store.setProfileVote(target, first, 0)).toMatchObject({ count: 1 });
      await store.setProfileVote(target, second, 0);
      expect((await store.readProfileVotes(first)).counts).not.toHaveProperty(target);
    }, 20_000);

    it("stores expiring hashed sessions and revokes them on sign-out", async () => {
      const store = fixture.store;
      const profile = { id: 12, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/12" };
      const hash = actor("session-token");
      await store.createSession(hash, profile, Date.now() + 60_000);
      expect(await store.readSession(hash)).toEqual(profile);
      expect(await store.readSession(actor("other-session"))).toBeNull();
      await store.removeSession(hash);
      expect(await store.readSession(hash)).toBeNull();
      await store.createSession(hash, profile, Date.now() - 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(await store.readSession(hash)).toBeNull();
    }, 20_000);

    it("blocks signed votes on pending tools and removes all profile selections on deletion", async () => {
      const store = fixture.store;
      const id = "profile-review";
      const target = `tool:${id}`;
      const voter = actor("github:review");
      await store.createTool(tool(id, undefined, "pending"));
      await expect(store.setProfileVote(target, voter, -1)).rejects.toMatchObject({ status: 404 });
      await store.approveTool(id);
      await store.setProfileVote(target, voter, -1);
      await store.removeTool(id);
      expect((await store.readProfileVotes(voter)).votes).not.toHaveProperty(target);
      expect((await store.readProfileVotes(null)).counts).not.toHaveProperty(target);
      await expect(store.setProfileVote(target, voter, 1)).rejects.toMatchObject({ status: 404 });
    }, 20_000);

    it("persists desired-state votes and isolates each visitor's choices", async () => {
      const store = fixture.store;
      const first = actor("first");
      const second = actor("second");
      await store.setVote("repo:integration-basic", first, true);
      expect(await store.setVote("repo:integration-basic", first, true)).toEqual({ target: "repo:integration-basic", active: true, count: 1 });
      expect(await store.setVote("repo:integration-basic", second, true)).toMatchObject({ count: 2 });
      expect((await store.readVotes(first)).voted).toContain("repo:integration-basic");
      expect((await store.readVotes(actor("stranger"))).voted).not.toContain("repo:integration-basic");
      await store.setVote("repo:integration-basic", first, false);
      expect(await store.setVote("repo:integration-basic", first, false)).toMatchObject({ count: 1 });
      expect((await store.readVotes(first)).voted).not.toContain("repo:integration-basic");
      expect((await store.readVotes(second)).voted).toContain("repo:integration-basic");
      await store.setVote("repo:integration-basic", second, false);
      expect(await store.setVote("repo:integration-basic", second, false)).toMatchObject({ count: 0 });
      expect((await store.readVotes(second)).counts).not.toHaveProperty("repo:integration-basic");
    }, 20_000);

    it("does not lose concurrent distinct voters or double-count replayed requests", async () => {
      const store = fixture.store;
      const actors = Array.from({ length: 32 }, (_, index) => actor(`concurrent-${index}`));
      await Promise.all(actors.flatMap((visitor) => [
        store.setVote("repo:integration-concurrent", visitor, true),
        store.setVote("repo:integration-concurrent", visitor, true),
      ]));
      expect((await store.readVotes(actors[0])).counts["repo:integration-concurrent"]).toBe(32);
      await Promise.all(actors.slice(0, 16).map((visitor) => store.setVote("repo:integration-concurrent", visitor, false)));
      expect((await store.readVotes(actors[0])).counts["repo:integration-concurrent"]).toBe(16);
    }, 20_000);

    it("round-trips tool records and resolves duplicate URL races once", async () => {
      const store = fixture.store;
      const url = "https://integration-duplicate.example/";
      const claims = await Promise.all([
        store.createTool(tool("duplicate-one", url)),
        store.createTool(tool("duplicate-two", url)),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const saved = (await store.listTools()).filter((entry) => entry.url === url);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toEqual(tool(saved[0].id, url));
      expect(await store.createTool(tool("curated-copy", CURATED_TOOLS[0].url))).toBe(false);
      await store.removeTool(saved[0].id);
      expect(await store.createTool(tool("duplicate-replacement", url))).toBe(true);
    }, 20_000);

    it("cleans tool votes during a racing deletion and rejects later votes", async () => {
      const store = fixture.store;
      const target = "tool:delete-race";
      const first = actor("delete-first");
      const late = actor("delete-late");
      await store.createTool(tool("delete-race"));
      await store.setVote(target, first, true);
      const outcomes = await Promise.allSettled([
        store.setVote(target, late, true),
        store.removeTool("delete-race"),
      ]);
      expect(outcomes[1].status).toBe("fulfilled");
      if (outcomes[0].status === "rejected") expect(outcomes[0].reason).toMatchObject({ status: 404, code: "not_found" });
      expect((await store.listTools()).some((entry) => entry.id === "delete-race")).toBe(false);
      expect((await store.readVotes(first)).counts).not.toHaveProperty(target);
      expect((await store.readVotes(first)).voted).not.toContain(target);
      expect((await store.readVotes(late)).voted).not.toContain(target);
      await expect(store.setVote(target, late, true)).rejects.toMatchObject({ status: 404, code: "not_found" });
      expect(await store.createTool(tool("delete-race"))).toBe(true);
      expect(await store.setVote(target, late, true)).toMatchObject({ count: 1 });
    }, 20_000);

    it("accepts curated tool votes without a stored tool record", async () => {
      const store = fixture.store;
      const target = `tool:${CURATED_TOOLS[0].id}`;
      expect(await store.setVote(target, actor("curated"), true)).toMatchObject({ target, active: true, count: 1 });
      expect((await store.readVotes(actor("curated"))).voted).toContain(target);
      expect((await store.listTools()).some((entry) => entry.id === CURATED_TOOLS[0].id)).toBe(false);
    }, 20_000);

    it("requires explicit review before voting and keeps approval idempotent", async () => {
      const store = fixture.store;
      const submitted = tool("review-pending", "https://review-pending.example/", "pending");
      const target = "tool:review-pending";
      const visitor = actor("pending-review");
      expect(await store.createTool(submitted)).toBe(true);
      await expect(store.setVote(target, visitor, true)).rejects.toMatchObject({ status: 404, code: "not_found" });
      expect(await store.approveTool("missing-review")).toBe(false);
      expect(await store.approveTool(submitted.id)).toBe(true);
      expect(await store.approveTool(submitted.id)).toBe(true);
      expect((await store.listTools()).find((entry) => entry.id === submitted.id)).toEqual({ ...submitted, status: "approved" });
      expect(await store.setVote(target, visitor, true)).toMatchObject({ count: 1 });
      await store.removeTool(submitted.id);
      expect(await store.approveTool(submitted.id)).toBe(false);
      expect((await store.readVotes(visitor)).voted).not.toContain(target);
    }, 20_000);

    it("requires review for legacy records without a status", async () => {
      const store = fixture.store;
      const legacy = tool("legacy-review");
      Reflect.deleteProperty(legacy, "status");
      await store.createTool(legacy);
      await expect(store.setVote("tool:legacy-review", actor("legacy"), true)).rejects.toMatchObject({ status: 404 });
      expect(await store.approveTool(legacy.id)).toBe(true);
      expect((await store.listTools()).find((entry) => entry.id === legacy.id)).toEqual({ ...legacy, status: "approved" });
      expect(await store.setVote("tool:legacy-review", actor("legacy"), true)).toMatchObject({ count: 1 });
    }, 20_000);
  });
}
