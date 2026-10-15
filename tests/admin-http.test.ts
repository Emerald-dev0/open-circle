import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAppServer } from "../server/node-server";
import { MemoryCommunityStore } from "../server/community-memory";
import { rebuildBoard } from "../server/board";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));

let server: Server;
let base: string;
let directory: string;
const origin = "https://opencircle.test";

beforeEach(async () => {
  const store = new TestStore();
  context.board = store;
  context.community = new MemoryCommunityStore(null);
  await store.createMember(memberRecord());
  await rebuildBoard(store);
  vi.stubEnv("ADMIN_GITHUB_IDS", "42");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-oauth-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`);
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-admin-http-"));
  writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>OpenCircle</title>");
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP test port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("serves admin sign-in, separate callback cookies, moderation and revocation through real HTTP behind HTTPS", async () => {
  const httpFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") return new Response(JSON.stringify({ access_token: "provider-secret", token_type: "bearer" }));
    if (url === "https://api.github.com/user") return new Response(JSON.stringify({ id: 42, login: "organiser", type: "User" }));
    return httpFetch(input, init);
  }));
  const page = await fetch(`${base}/admin`);
  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toBe("no-store");
  expect(page.headers.get("x-frame-options")).toBe("DENY");
  expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect((await fetch(`${base}/api/admin`)).status).toBe(401);
  expect(await (await fetch(`${base}/api/admin-session`)).json()).toEqual({ configured: true, profile: null });
  const start = await fetch(`${base}/api/auth-start?returnTo=%2Fadmin`, { redirect: "manual" });
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get("location")!).searchParams.get("state");
  const callback = await fetch(`${base}/api/auth-callback?code=verified&state=${state}`, { redirect: "manual", headers: { cookie: start.headers.getSetCookie()[0].split(";", 1)[0] } });
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/admin");
  const cookies = callback.headers.getSetCookie();
  expect(cookies).toHaveLength(2);
  const cookie = cookies.find((value) => value.startsWith("__Host-opencircle_admin="))!.split(";", 1)[0];
  const headers = { cookie, origin, "x-opencircle-admin": "1", "content-type": "application/json" };
  const admin = await fetch(`${base}/api/admin`, { headers });
  expect(admin.status).toBe(200);
  expect((await admin.json()).members[0].login).toBe("Octocat");
  expect((await fetch(`${base}/api/tools`, { headers })).status).toBe(200);
  const change = { action: "hide", login: "octocat" };
  expect((await fetch(`${base}/api/admin`, { method: "POST", headers: { ...headers, origin: "https://evil.test" }, body: JSON.stringify(change) })).status).toBe(403);
  expect((await fetch(`${base}/api/admin`, { method: "POST", headers, body: JSON.stringify(change) })).status).toBe(200);
  expect((await (await fetch(`${base}/api/board`)).json()).members).toEqual([]);
  expect((await fetch(`${base}/api/admin`, { method: "POST", headers, body: JSON.stringify({ action: "unhide", login: "octocat" }) })).status).toBe(200);
  expect((await (await fetch(`${base}/api/board`)).json()).members).toHaveLength(1);
  const signedOut = await fetch(`${base}/api/admin-session`, { method: "DELETE", headers, body: "{}" });
  expect(signedOut.headers.getSetCookie()[0]).toContain("Max-Age=0");
  expect((await fetch(`${base}/api/admin`, { headers })).status).toBe(401);
});

it("rejects oversized JSON before mutations and keeps malformed URLs from crashing the server", async () => {
  const response = await fetch(`${base}/api/admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(5000) }) });
  expect(response.status).toBe(413);
  expect((await response.json()).error.code).toBe("too_large");
  expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
  expect((await fetch(`${base}/admin`)).status).toBe(200);
});
