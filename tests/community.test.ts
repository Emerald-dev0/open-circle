import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getCommunity } from "../api/community";
import { POST as postVote } from "../api/vote";
import { DELETE as deleteTool, GET as getAdminTools, PATCH as approveTool, POST as postTool } from "../api/tools";
import { rebuildBoard } from "../server/board";
import { MemoryCommunityStore } from "../server/community-memory";
import { createAdminSession } from "../server/admin-session";
import { visitor } from "../server/community";
import { parseToolInput } from "../shared/tool-validation";
import { CURATED_TOOLS } from "../shared/tools";
import type { CommunityState, CommunityTool } from "../shared/community";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));

const tool = { name: "Useful Kit", description: "A small collection of developer utilities.", category: "Development", url: "https://useful-kit.dev/" };
let board: TestStore;
let community: MemoryCommunityStore;
let cookie: string;
let adminCookie: string;

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://opencircle.test/api/${path}`, {
    method,
    headers: { "x-opencircle-admin": "1", "content-type": "application/json", origin: "https://opencircle.test", "x-vercel-forwarded-for": "203.0.113.2", cookie, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  board = new TestStore();
  community = new MemoryCommunityStore(null);
  context.board = board;
  context.community = community;
  cookie = "";
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "https://opencircle.test/api/auth-callback");
  await board.createMember(memberRecord());
  await rebuildBoard(board);
  const response = await getCommunity(request("community"));
  const token = "a".repeat(64);
  await community.createSession(createHash("sha256").update(token).digest("hex"), { id: 1, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" }, Date.now() + 60_000);
  cookie = `${response.headers.get("set-cookie")!.split(";", 1)[0]}; opencircle_github=${token}`;
  vi.stubEnv("ADMIN_GITHUB_IDS", "1");
  adminCookie = (await createAdminSession(request("admin"), community, { id: 1, login: "octocat", avatarUrl: "" })).split(";", 1)[0];
});

afterEach(() => vi.unstubAllEnvs());

describe("Community API workflow", () => {
  it("issues a private visitor cookie, lists real curated tools and returns no private member details", async () => {
    const response = await getCommunity(request("community", "GET", undefined, { cookie: "" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=31536000; Secure$/);
    const state = await response.json() as CommunityState;
    expect(state.tools).toEqual(CURATED_TOOLS);
    expect(state.counts).toEqual({});
    expect(state.voted).toEqual([]);
    expect(JSON.stringify(state)).not.toMatch(/whatsapp|2348031234567|actor/);
  });

  it("persists one repo upvote per visitor, makes retries idempotent and supports removing a vote", async () => {
    const input = { target: "repo:R_open-kit", active: true };
    for (let i = 0; i < 3; i++) {
      const response = await postVote(request("vote", "POST", input));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...input, count: 1 });
    }
    const own = await (await getCommunity(request("community"))).json() as CommunityState;
    expect((await board.getBoard())?.members[0]).toMatchObject({ upvotes: 1, score: 69 });
    expect(own.counts[input.target]).toBe(1);
    expect(own.voted).toEqual([input.target]);
    const other = await (await getCommunity(request("community", "GET", undefined, { cookie: "" }))).json() as CommunityState;
    expect(other.counts[input.target]).toBe(1);
    expect(other.voted).toEqual([]);
    const removed = await postVote(request("vote", "POST", { ...input, active: false }));
    expect(await removed.json()).toEqual({ ...input, active: false, count: 0 });
    expect((await board.getBoard())?.repositories[0].stars).toBe(10);
    expect((await board.getBoard())?.members[0]).toMatchObject({ upvotes: 0, score: 68 });
  });

  it("supports independent voters without counting duplicate concurrent requests twice", async () => {
    const input = { target: "repo:R_open-kit", active: true };
    const otherCookie = `opencircle_visitor=${"b".repeat(64)}`;
    const results = await Promise.all([
      postVote(request("vote", "POST", input)),
      postVote(request("vote", "POST", input)),
      postVote(request("vote", "POST", input, { cookie: otherCookie })),
    ]);
    expect(results.every((response) => response.status === 200)).toBe(true);
    expect((await community.readVotes(visitor(request("community")).actor)).counts[input.target]).toBe(2);
    expect((await board.getBoard())?.members[0]).toMatchObject({ upvotes: 2, score: 70 });
  });

  it("rejects nonexistent and hidden member repositories without storing votes", async () => {
    expect((await postVote(request("vote", "POST", { target: "repo:unknown", active: true }))).status).toBe(404);
    await board.patchMember("octocat", { hidden: true });
    await rebuildBoard(board);
    expect((await postVote(request("vote", "POST", { target: "repo:R_open-kit", active: true }))).status).toBe(404);
    expect((await community.readVotes("anyone")).counts).toEqual({});
  });

  it("keeps submissions private until admin approval and removes rejected tools and their votes", async () => {
    const submitted = await postTool(request("tools", "POST", { ...tool, status: "approved" }));
    expect(submitted.status).toBe(201);
    const created = await submitted.json() as CommunityTool;
    expect(created).toMatchObject({ ...tool, source: "community", status: "pending" });
    expect((await postTool(request("tools", "POST", { ...tool, url: `${tool.url}#about` }))).status).toBe(409);
    expect((await postTool(request("tools", "POST", { ...tool, url: "https://excalidraw.com" }))).status).toBe(409);
    const before = await (await getCommunity(request("community"))).json() as CommunityState;
    expect(before.tools.some((item) => item.id === created.id)).toBe(false);
    expect((await postVote(request("vote", "POST", { target: `tool:${created.id}`, value: 1 }))).status).toBe(404);
    expect((await getAdminTools(request("tools"))).status).toBe(401);
    const adminHeaders = { cookie: `${cookie}; ${adminCookie}` };
    const queue = await getAdminTools(request("tools", "GET", undefined, adminHeaders));
    expect(queue.headers.get("cache-control")).toBe("private, no-store");
    expect(await queue.json()).toEqual([...CURATED_TOOLS, created]);
    expect((await approveTool(request("tools", "PATCH", { id: created.id, action: "approve" }))).status).toBe(401);
    expect((await approveTool(request("tools", "PATCH", { id: created.id, action: "approve" }, adminHeaders))).status).toBe(200);
    const approved = await (await getCommunity(request("community"))).json() as CommunityState;
    expect(approved.tools.find((item) => item.id === created.id)?.status).toBe("approved");
    expect((await postVote(request("vote", "POST", { target: `tool:${created.id}`, value: 1 }))).status).toBe(200);
    expect((await deleteTool(request("tools", "DELETE", { id: created.id }))).status).toBe(401);
    expect((await community.listTools()).length).toBe(1);
    expect((await deleteTool(request("tools", "DELETE", { id: created.id }, { cookie: `${cookie}; ${adminCookie}` }))).status).toBe(200);
    expect(await community.listTools()).toEqual([]);
    expect((await community.readVotes("anyone")).counts).toEqual({});
    expect((await postVote(request("vote", "POST", { target: `tool:${created.id}`, value: 1 }))).status).toBe(404);
  });

  it("rejects pending submissions without exposing their details or allowing them to reappear", async () => {
    const response = await postTool(request("tools", "POST", tool));
    const created = await response.json() as CommunityTool;
    const headers = { cookie: `${cookie}; ${adminCookie}` };
    expect((await deleteTool(request("tools", "DELETE", { id: created.id }, headers))).status).toBe(200);
    expect((await getAdminTools(request("tools", "GET", undefined, headers))).status).toBe(200);
    expect(await community.listTools()).toEqual([]);
    expect((await approveTool(request("tools", "PATCH", { id: created.id, action: "approve" }, headers))).status).toBe(404);
    expect((await (await getCommunity(request("community"))).json() as CommunityState).tools).toEqual(CURATED_TOOLS);
  });

  it("lets only an admin publish a validated tool immediately without a visitor cookie", async () => {
    const input = { ...tool, action: "create", status: "pending", source: "curated" };
    expect((await approveTool(request("tools", "PATCH", input))).status).toBe(401);
    const headers = { cookie: adminCookie };
    const invalid = await approveTool(request("tools", "PATCH", { ...input, url: "javascript:alert(1)" }, headers));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.field).toBe("url");
    const response = await approveTool(request("tools", "PATCH", input, headers));
    expect(response.status).toBe(201);
    const created = await response.json() as CommunityTool;
    expect(created).toMatchObject({ ...tool, status: "approved", source: "community" });
    expect((await (await getAdminTools(request("tools", "GET", undefined, headers))).json())).toEqual([...CURATED_TOOLS, created]);
    expect((await (await getCommunity(request("community"))).json() as CommunityState).tools).toContainEqual(created);
    expect((await approveTool(request("tools", "PATCH", { ...input, url: `${tool.url}#duplicate` }, headers))).status).toBe(409);
    const publicSubmission = await postTool(request("tools", "POST", { ...input, url: "https://another-kit.dev/" }));
    expect((await publicSubmission.json()).status).toBe("pending");
  });

  it("lists and removes built-in tools consistently, clears votes and permits adding them again", async () => {
    const headers = { cookie: `${cookie}; ${adminCookie}` };
    const tool = CURATED_TOOLS[0];
    expect(await (await getAdminTools(request("tools", "GET", undefined, headers))).json()).toEqual(CURATED_TOOLS);
    expect((await postVote(request("vote", "POST", { target: `tool:${tool.id}`, value: -1 }))).status).toBe(200);
    expect((await deleteTool(request("tools", "DELETE", { id: tool.id }, headers))).status).toBe(200);
    const publicState = await (await getCommunity(request("community"))).json() as CommunityState;
    expect(publicState.tools).toEqual(CURATED_TOOLS.slice(1));
    expect(publicState.counts).not.toHaveProperty(`tool:${tool.id}`);
    expect(publicState.toolVotes).not.toHaveProperty(`tool:${tool.id}`);
    expect(await (await getAdminTools(request("tools", "GET", undefined, headers))).json()).toEqual(CURATED_TOOLS.slice(1));
    expect((await postVote(request("vote", "POST", { target: `tool:${tool.id}`, value: 1 }))).status).toBe(404);
    expect((await approveTool(request("tools", "PATCH", { id: tool.id, action: "approve" }, headers))).status).toBe(404);
    const restored = await approveTool(request("tools", "PATCH", { ...tool, action: "create" }, headers));
    expect(restored.status).toBe(201);
    const state = await (await getCommunity(request("community"))).json() as CommunityState;
    expect(state.tools.filter((entry) => entry.id === tool.id)).toHaveLength(1);
    expect(state.counts).not.toHaveProperty(`tool:${tool.id}`);
  });

  it("upvotes curated tools with a signed-in GitHub account without requiring board membership", async () => {
    context.board = new TestStore();
    const response = await postVote(request("vote", "POST", { target: "tool:excalidraw", value: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ target: "tool:excalidraw", count: 1, value: 1 });
  });

  it("rejects cross-origin writes and non-JSON submissions before modifying storage", async () => {
    expect((await postVote(request("vote", "POST", { target: "repo:R_open-kit", active: true }, { origin: "https://elsewhere.test" }))).status).toBe(403);
    expect((await postTool(request("tools", "POST", tool, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await postTool(request("tools", "POST", tool, { "content-type": "text/plain" }))).status).toBe(415);
    expect(await community.listTools()).toEqual([]);
    expect((await community.readVotes("anyone")).counts).toEqual({});
  });

  it("requires the initialized visitor cookie before writing, without minting competing identities", async () => {
    const voteResponse = await postVote(request("vote", "POST", { target: "repo:R_open-kit", active: true }, { cookie: "" }));
    const toolResponse = await postTool(request("tools", "POST", tool, { cookie: "opencircle_visitor=invalid" }));
    expect(voteResponse.status).toBe(409);
    expect(toolResponse.status).toBe(409);
    expect(voteResponse.headers.get("set-cookie")).toBeNull();
    expect(await community.listTools()).toEqual([]);
    expect((await community.readVotes("anyone")).counts).toEqual({});
  });

  it("bounds payloads and rejects invalid vote shapes", async () => {
    expect((await postTool(request("tools", "POST", { ...tool, description: "a".repeat(5000) }))).status).toBe(413);
    for (const body of [null, { target: "repo:R_open-kit", active: "true" }, { target: "member:octocat", active: true }]) {
      expect((await postVote(request("vote", "POST", body))).status).toBe(400);
    }
  });

  it("rate-limits both visitor and IP to contain repeat submissions", async () => {
    const input = { target: "repo:R_open-kit", active: true };
    for (let i = 0; i < 60; i++) expect((await postVote(request("vote", "POST", input))).status).toBe(200);
    const response = await postVote(request("vote", "POST", input));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    const differentVisitor = await postVote(request("vote", "POST", input, { cookie: `opencircle_visitor=${"c".repeat(64)}` }));
    expect(differentVisitor.status).toBe(429);
    for (let i = 0; i < 5; i++) expect((await postTool(request("tools", "POST", { ...tool, url: `https://kit-${i}.dev/` }))).status).toBe(201);
    const limited = await postTool(request("tools", "POST", { ...tool, url: "https://extra-kit.dev/" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
  });
});

describe("Shared tool validation", () => {
  it("normalizes display text, fragments, query ordering and trailing slashes", () => {
    expect(parseToolInput({ ...tool, name: "  Useful   Kit  ", url: "https://useful-kit.dev/docs///?b=2&a=1#intro" })).toEqual({ ok: true, value: { ...tool, url: "https://useful-kit.dev/docs?a=1&b=2" } });
  });

  it.each(["javascript:alert(1)", "http://useful-kit.dev", "https://me:secret@useful-kit.dev", "https://localhost", "https://localhost.", "https://127.0.0.1", "https://[::1]", "https://app.local", "https://useful-kit.dev:444", "https://useful-kit.dev/a b"])("rejects unsafe or local tool links: %s", (url) => {
    expect(parseToolInput({ ...tool, url })).toMatchObject({ ok: false, field: "url" });
  });

  it("enforces category and text limits before tools are published", () => {
    expect(parseToolInput({ ...tool, category: "Other" })).toMatchObject({ ok: false, field: "category" });
    expect(parseToolInput({ ...tool, name: "a" })).toMatchObject({ ok: false, field: "name" });
    expect(parseToolInput({ ...tool, description: "short" })).toMatchObject({ ok: false, field: "description" });
  });
});
