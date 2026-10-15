import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAdmin, POST as postAdmin } from "../api/admin";
import { GET as getSession, DELETE as logout } from "../api/admin-session";
import { GET as getTools, PATCH as approveTool, DELETE as removeTool } from "../api/tools";
import { adminSessionHash, createAdminSession, ADMIN_SESSION_SECONDS } from "../server/admin-session";
import { beginGitHubSignIn, finishGitHubSignIn } from "../server/github-auth";
import { MemoryCommunityStore } from "../server/community-memory";
import { rebuildBoard } from "../server/board";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));

const profile = { id: 42, login: "organiser", avatarUrl: "https://avatars.githubusercontent.com/u/42?s=80" };
const origin = "https://opencircle.test";
let store: TestStore;
let community: MemoryCommunityStore;
let cookie: string;

function request(path = "admin", method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/${path}`, { method, headers: { cookie, origin, "content-type": "application/json", "x-opencircle-admin": "1", "x-vercel-forwarded-for": "203.0.113.1", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(async () => {
  store = new TestStore();
  community = new MemoryCommunityStore(null);
  context.board = store;
  context.community = community;
  cookie = "";
  vi.stubEnv("ADMIN_GITHUB_IDS", "42, 123");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-oauth-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`);
  await store.createMember(memberRecord());
  await rebuildBoard(store);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function signIn() {
  const header = await createAdminSession(request(), community, profile);
  cookie = header.split(";", 1)[0];
  return header;
}

function provider() {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-secret", token_type: "bearer" }))).mockResolvedValueOnce(new Response(JSON.stringify({ ...profile, type: "User" })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Admin security boundary", () => {
  it.each(["", "organiser", "42,", "0", "42,abc", "9007199254740992"])("fails closed with invalid allowlist %s", async (ids) => {
    vi.stubEnv("ADMIN_GITHUB_IDS", ids);
    expect(await (await getSession(request("admin-session"))).json()).toEqual({ configured: false, profile: null });
    expect((await getAdmin(request())).status).toBe(503);
  });

  it("accepts only a separate approved GitHub admin session and never the old shared secret", async () => {
    vi.stubEnv("ADMIN_SECRET", "legacy-secret");
    expect((await getAdmin(request("admin", "GET", undefined, { authorization: "Bearer legacy-secret" }))).status).toBe(401);
    const header = await signIn();
    const hash = adminSessionHash(request())!;
    expect(header).toMatch(/^__Host-opencircle_admin=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure$/);
    expect(hash).not.toBe(cookie.split("=")[1]);
    const response = await getAdmin(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).members[0].whatsapp).toBeTruthy();
    expect(await (await getSession(request("admin-session"))).json()).toEqual({ configured: true, profile });
    expect((await getAdmin(request("admin", "GET", undefined, { cookie: cookie.replace("__Host-opencircle_admin", "opencircle_github") }))).status).toBe(401);
    expect((await getAdmin(request("admin", "GET", undefined, { cookie: `__Host-opencircle_admin=${"f".repeat(64)}` }))).status).toBe(401);
  });

  it("expires admin access on the server and rechecks the allowlist on every request", async () => {
    await signIn();
    vi.stubEnv("ADMIN_GITHUB_IDS", "123");
    expect((await getAdmin(request())).status).toBe(401);
    vi.stubEnv("ADMIN_GITHUB_IDS", "42");
    expect((await getAdmin(request())).status).toBe(200);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + ADMIN_SESSION_SECONDS * 1000 + 1);
    expect((await getAdmin(request())).status).toBe(401);
  });

  it("revokes the session on sign-out and rejects cross-site logout", async () => {
    await signIn();
    expect((await logout(request("admin-session", "DELETE", {}, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await getAdmin(request())).status).toBe(200);
    const response = await logout(request("admin-session", "DELETE", {}));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await getAdmin(request())).status).toBe(401);
    expect(await (await getSession(request("admin-session"))).json()).toEqual({ configured: true, profile: null });
  });

  it.each([
    { origin: "https://evil.test" },
    { origin: "null" },
    { origin: "" },
    { "sec-fetch-site": "cross-site" },
    { "x-opencircle-admin": "" },
    { "content-type": "text/plain" },
  ] as Record<string, string>[])("blocks unsafe member, settings and tool mutations: %j", async (headers) => {
    await signIn();
    expect((await postAdmin(request("admin", "POST", { action: "hide", login: "octocat" }, headers))).status).toBeGreaterThanOrEqual(400);
    expect((await approveTool(request("tools", "PATCH", { id: "pending", action: "approve" }, headers))).status).toBeGreaterThanOrEqual(400);
    expect((await removeTool(request("tools", "DELETE", { id: "pending" }, headers))).status).toBeGreaterThanOrEqual(400);
    expect((await store.getMember("octocat"))?.hidden).toBe(false);
  });

  it("protects every private endpoint and returns no member details on denied reads", async () => {
    const requests = [getAdmin(request()), postAdmin(request("admin", "POST", { action: "remove", login: "octocat" })), getTools(request("tools")), approveTool(request("tools", "PATCH", { id: "pending", action: "approve" })), removeTool(request("tools", "DELETE", { id: "pending" }))];
    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("whatsapp");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    await signIn();
    expect((await getAdmin(request("admin", "GET", undefined, { origin: "https://evil.test" }))).status).toBe(403);
  });

  it("validates moderation actions and applies member/settings changes to the public board", async () => {
    await signIn();
    expect((await postAdmin(request("admin", "POST", { action: "hide", login: "missing" }))).status).toBe(404);
    expect((await postAdmin(request("admin", "POST", { action: "hide", login: {} }))).status).toBe(400);
    expect((await postAdmin(request("admin", "POST", { action: "bad" }))).status).toBe(400);
    expect((await postAdmin(request("admin", "POST", { action: "config", config: {} }))).status).toBe(400);
    const initial = await (await getAdmin(request())).json();
    const config = { ...initial.config, invite: { ...initial.config.invite, note: "Group full", open: false } };
    expect((await postAdmin(request("admin", "POST", { action: "config", config }))).status).toBe(200);
    expect((await store.getBoard())?.invite).toEqual(config.invite);
    expect((await postAdmin(request("admin", "POST", { action: "hide", login: "OCTOCAT" }))).status).toBe(200);
    expect((await store.getBoard())?.members).toEqual([]);
    expect((await postAdmin(request("admin", "POST", { action: "unhide", login: "octocat" }))).status).toBe(200);
    expect((await store.getBoard())?.members).toHaveLength(1);
  });

  it("limits admin requests per IP and per approved account", async () => {
    await signIn();
    const limit = vi.spyOn(store, "rateLimit");
    await getAdmin(request());
    expect(limit).toHaveBeenCalledWith("admin:account:42", 120, 60);
    limit.mockImplementation(async (key) => !key.startsWith("admin:account:"));
    const response = await getAdmin(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("Admin GitHub sign-in", () => {
  it("binds the admin destination to signed OAuth state and creates a short separate session", async () => {
    const start = beginGitHubSignIn(request("auth-start?returnTo=%2Fadmin"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    provider();
    const response = await finishGitHubSignIn(request(`auth-callback?state=${state}&code=valid`, "GET", undefined, { cookie: start.headers.get("set-cookie")!.split(";", 1)[0] }), community);
    expect(response.headers.get("location")).toBe("/admin");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    cookie = response.headers.getSetCookie().find((value) => value.startsWith("__Host-opencircle_admin="))!.split(";", 1)[0];
    expect((await getAdmin(request())).status).toBe(200);
    expect(response.headers.getSetCookie().join(" ")).not.toMatch(/provider-secret|opencircle_github=/);
    expect(response.headers.getSetCookie().join(" ")).toContain("Max-Age=3600");
  });

  it("rejects a valid GitHub identity without the approved immutable ID", async () => {
    vi.stubEnv("ADMIN_GITHUB_IDS", "123");
    const start = beginGitHubSignIn(request("auth-start?returnTo=%2Fadmin"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    provider();
    const create = vi.spyOn(community, "createSession");
    const response = await finishGitHubSignIn(request(`auth-callback?state=${state}&code=valid`, "GET", undefined, { cookie: start.headers.get("set-cookie")!.split(";", 1)[0] }), community);
    expect(response.headers.get("location")).toBe("/admin?signin=admin_forbidden");
    expect(create).not.toHaveBeenCalled();
  });

  it("doesn't turn a normal sign-in into admin access through callback parameters", async () => {
    const start = beginGitHubSignIn(request("auth-start?returnTo=https://evil.test"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    provider();
    const response = await finishGitHubSignIn(request(`auth-callback?state=${state}&code=valid&returnTo=/admin`, "GET", undefined, { cookie: start.headers.get("set-cookie")!.split(";", 1)[0] }), community);
    expect(response.headers.get("location")).toBe("/tools");
    expect(response.headers.getSetCookie().join(" ")).not.toContain("opencircle_admin=");
  });
});
