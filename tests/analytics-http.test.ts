import type { Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryAnalyticsStore } from "../server/analytics-store";
import { MemoryCommunityStore } from "../server/community-memory";
import { createAdminSession } from "../server/admin-session";
import { createAppServer } from "../server/node-server";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown, analytics: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
vi.mock("../server/analytics-store", async (original) => ({ ...await original<typeof import("../server/analytics-store")>(), getAnalyticsStore: () => context.analytics }));

let server: Server;
let base: string;
let directory: string;
let adminCookie: string;
const origin = "https://opencircle.test";

beforeEach(async () => {
  context.board = new TestStore();
  const community = new MemoryCommunityStore(null);
  context.community = community;
  context.analytics = new MemoryAnalyticsStore(null);
  vi.stubEnv("ADMIN_GITHUB_IDS", "42");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${origin}/api/auth-callback`);
  adminCookie = (await createAdminSession(new Request(`${origin}/api/analytics`), community, { id: 42, login: "owner", avatarUrl: "" })).split(";")[0];
  directory = mkdtempSync(path.join(tmpdir(), "oc-traffic-http-"));
  writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>OpenCircle</title>");
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("collects public route visits over real HTTP and only reveals aggregate metrics to an admin", async () => {
  const visit = async (cookie?: string) => fetch(`${base}/api/analytics`, { method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ page: "/tools", referrer: "https://github.com/open-circle?private=value" }) });
  const first = await visit();
  expect(first.status).toBe(200);
  const cookie = first.headers.getSetCookie()[0].split(";")[0];
  expect(cookie).toContain("opencircle_analytics=");
  await visit(cookie);
  await visit();
  expect((await fetch(`${base}/api/analytics`)).status).toBe(401);
  const response = await fetch(`${base}/api/analytics?days=7`, { headers: { cookie: adminCookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const result = await response.json();
  expect(result.current).toMatchObject({ visitors: 2, pageViews: 3, returningVisitors: 0, pages: [{ name: "/tools", views: 3 }], sources: [{ name: "github.com", views: 3 }] });
  expect(result.current.daily).toHaveLength(7);
  expect(JSON.stringify(result)).not.toContain(cookie.split("=")[1]);
  expect((await fetch(`${base}/api/analytics?days=1000`, { headers: { cookie: adminCookie } })).status).toBe(400);
  expect((await fetch(`${base}/api/analytics`, { headers: { cookie: adminCookie, origin: "https://evil.test" } })).status).toBe(403);
});

it("rejects cross-origin and invalid traffic, skips opt-outs, and enforces request limits", async () => {
  const post = (headers: Record<string, string>, page = "/") => fetch(`${base}/api/analytics`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ page, referrer: "" }) });
  expect((await post({ origin: "https://evil.test" })).status).toBe(403);
  expect((await post({}, "/admin")).status).toBe(400);
  expect((await post({ "content-type": "text/plain" })).status).toBe(415);
  expect((await post({ dnt: "1" })).headers.getSetCookie()).toEqual([]);
  expect((await post({ "sec-gpc": "1" })).status).toBe(200);
  expect((await post({ "user-agent": "Googlebot" })).status).toBe(200);
  expect(await (context.analytics as MemoryAnalyticsStore).startedAt()).toBeNull();
  vi.spyOn(context.board as TestStore, "rateLimit").mockResolvedValue(false);
  expect((await post({})).status).toBe(429);
  expect(await (context.analytics as MemoryAnalyticsStore).startedAt()).toBeNull();
});
