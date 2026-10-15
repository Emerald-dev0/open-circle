import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DAY, dayStart, type AnalyticsStore, PostgresAnalyticsStore, RedisAnalyticsStore } from "../server/analytics-store.js";
import { runMigrations } from "../scripts/migrations.js";

const execute = promisify(execFile);
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface AdapterFixture {
  store: AnalyticsStore;
  close(): Promise<void>;
}

function actor(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function postgresFixture(): Promise<AdapterFixture> {
  const connectionString = process.env.COMMUNITY_TEST_DATABASE_URL!;
  const connection = new URL(connectionString);
  const host = connection.searchParams.get("host") || connection.hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "/tmp", "/var/run/postgresql"].includes(host)) {
    throw new Error("COMMUNITY_TEST_DATABASE_URL must point at local PostgreSQL.");
  }
  const database = `oc_analytics_test_${randomUUID().replaceAll("-", "")}`;
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
    const client = await pool.connect();
    try {
      expect(await runMigrations(client)).toContain("004_analytics.sql");
      expect(await runMigrations(client)).toEqual([]);
    } finally { client.release(); }
    return { store: new PostgresAnalyticsStore(pool), close };
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
  const directory = mkdtempSync("/tmp/oc-analytics-redis-");
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
    return { store: new RedisAnalyticsStore(`http://127.0.0.1:${address.port}`, "local-test"), close };
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
  describe.skipIf(!adapter.enabled)(`${adapter.name} traffic adapter`, () => {
    let fixture: AdapterFixture;
    beforeAll(async () => { fixture = await adapter.create(); }, 15_000);
    afterAll(async () => { await fixture?.close(); }, 15_000);

    it("preserves concurrent views, distinct browsers, returning visitors, period boundaries and expiry", async () => {
      const store = fixture.store;
      const today = dayStart(Date.now());
      expect(await store.startedAt()).toBeNull();
      expect(await store.read(today - DAY, today + DAY)).toMatchObject({ visitors: 0, pageViews: 0 });
      const old = { actor: actor("expired"), page: "/" as const, source: "Direct", at: today - 181 * DAY };
      await store.record(old);
      const first = { actor: actor("first"), page: "/" as const, source: "github.com", at: today - DAY };
      await Promise.all(Array.from({ length: 8 }, () => store.record(first)));
      await store.record({ ...first, at: today, page: "/tools" });
      await store.record({ ...first, actor: actor("second"), at: today, source: "Direct" });
      const period = await store.read(today - DAY, today + DAY);
      expect(period).toMatchObject({ visitors: 2, pageViews: 10, returningVisitors: 1 });
      expect(period.daily.map((day) => [day.visitors, day.pageViews])).toEqual([[1, 8], [2, 2]]);
      expect(period.pages).toEqual([{ name: "/", views: 9 }, { name: "/tools", views: 1 }]);
      expect(period.sources).toEqual([{ name: "github.com", views: 9 }, { name: "Direct", views: 1 }]);
      expect((await store.read(today, today + DAY)).visitors).toBe(2);
      expect((await store.read(today - 182 * DAY, today + DAY)).pageViews).toBe(10);
      expect(await store.startedAt()).toBe(old.at);
    }, 20_000);
  });
}
