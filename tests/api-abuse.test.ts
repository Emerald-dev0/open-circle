import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as boardGET } from "../api/board";
import { GET as communityGET } from "../api/community";
import { POST as registerPOST } from "../api/register";
import { POST as previewPOST } from "../api/preview";
import { GET as callbackGET } from "../api/auth-callback";
import { MemoryCommunityStore } from "../server/community-memory";
import { apiHandler } from "../server/api-security";
import { json } from "../server/http";
import { clientKey } from "../server/rate-limit";
import { createAppServer } from "../server/node-server";
import { rebuildBoard } from "../server/board";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let store: TestStore;
let server: Server | undefined;
let directory: string | undefined;

beforeEach(async () => {
  store = new TestStore(); context.board = store; context.community = new MemoryCommunityStore(null);
  await store.createMember(memberRecord()); await rebuildBoard(store, { refreshedAt: Date.now() });
});
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; }
  if (directory) { rmSync(directory, { recursive: true, force: true }); directory = undefined; }
  vi.unstubAllEnvs(); vi.useRealTimers();
});

it("limits public polling across endpoints and cookies, with a fresh window after Retry-After", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  for (let index = 0; index < 240; index++) {
    const handler = index % 2 ? communityGET : boardGET;
    const req = new Request(`https://opencircle.test/api/${index % 2 ? "community" : "board"}`, { headers: { "x-vercel-forwarded-for": "192.0.2.1", cookie: `opencircle_visitor=${index.toString(16).padStart(64, "0")}` } });
    expect((await handler(req)).status).toBe(200);
  }
  const req = new Request("https://opencircle.test/api/board", { headers: { "x-vercel-forwarded-for": "192.0.2.1" } });
  const blocked = await boardGET(req);
  expect(blocked.status).toBe(429); expect(blocked.headers.get("retry-after")).toBe("60");
  expect(blocked.headers.get("cache-control")).toBe("no-store");
  expect((await boardGET(new Request(req.url, { headers: { "x-vercel-forwarded-for": "192.0.2.2" } }))).status).toBe(200);
  vi.setSystemTime(Date.now() + 60_001);
  expect((await boardGET(req)).status).toBe(200);
});

it.each([registerPOST, previewPOST])("blocks foreign forms, sibling sites and non-JSON registration lookups before work starts", async (handler) => {
  const body = JSON.stringify({ github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" });
  const origins: Record<string, string>[] = [{ origin: "https://evil.test", "content-type": "application/json" }, { "sec-fetch-site": "same-site", "content-type": "application/json" }, { "sec-fetch-site": "cross-site", "content-type": "application/json" }, { origin: "null", "content-type": "application/json" }];
  for (const headers of origins) {
    expect((await handler(new Request("https://opencircle.test/api/register", { method: "POST", headers, body }))).status).toBe(403);
  }
  expect((await handler(new Request("https://opencircle.test/api/register", { method: "POST", headers: { "content-type": "text/plain" }, body }))).status).toBe(415);
  expect((await store.listMembers())).toHaveLength(1);
});

it("normalizes IPv4-mapped addresses and IPv6 subnets and ignores untrusted forwarding headers", () => {
  const key = (ip: string) => clientKey(new Request("https://opencircle.test", { headers: { "x-vercel-forwarded-for": ip } }));
  expect(key("192.0.2.1")).toBe(key("::ffff:192.0.2.1"));
  expect(key("2001:db8:abcd:1234::1")).toBe(key("2001:0DB8:ABCD:1234:0000:0000:0000:0002"));
  expect(key("2001:db8:abcd:1235::1")).not.toBe(key("2001:db8:abcd:1234::1"));
  const forwarded = (ip: string) => clientKey(new Request("https://opencircle.test", { headers: { "x-forwarded-for": ip } }));
  expect(forwarded("192.0.2.1")).toBe(forwarded("192.0.2.2"));
  expect(key("bad-ip")).toMatch(/^[a-f0-9]{64}$/);
  expect(key("fe80::1%lo0")).toMatch(/^[a-f0-9]{64}$/);
});

it("returns safe headers on redirects, data and errors, and rejects long URLs or malformed lengths", async () => {
  for (const response of [await boardGET(new Request("https://opencircle.test/api/board")), await apiHandler(new Request("https://opencircle.test/api/test"), async () => new Response(null, { status: 302, headers: { location: "/" } })), await boardGET(new Request(`https://opencircle.test/api/board?q=${"x".repeat(4096)}`))]) {
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.has("cache-control")).toBe(true);
  }
  const response = await boardGET(new Request(`https://opencircle.test/api/board?q=${"x".repeat(4096)}`));
  expect(response.status).toBe(414);
  const run = vi.fn(async () => json({ ok: true }));
  for (const length of ["-1", "garbage", "9007199254740992"]) {
    expect((await apiHandler(new Request("https://opencircle.test/api/test", { method: "POST", headers: { "content-length": length, "content-type": "application/json" } }), run)).status).toBe(400);
  }
  expect(run).not.toHaveBeenCalled();
});

it("limits OAuth callbacks before contacting the provider", async () => {
  const req = new Request("https://opencircle.test/api/auth-callback");
  for (let index = 0; index < 30; index++) await callbackGET(req);
  const response = await callbackGET(req);
  expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
});

it("applies guards through real HTTP despite spoofed forwarding headers and rejects unknown API methods and paths", async () => {
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-abuse-"));
  writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>OpenCircle</title>");
  vi.stubEnv("TRUST_PROXY", "0");
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing port");
  const base = `http://127.0.0.1:${address.port}`;
  const spoofed = { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "203.0.113.9" };
  const method = await fetch(`${base}/api/board`, { method: "POST", headers: spoofed });
  expect(method.status).toBe(405); expect(method.headers.get("allow")).toBe("GET");
  expect((await method.json()).error.code).toBe("method_not_allowed");
  for (const route of ["/api/no-such-route", "/api/board/extra", "/api"]) {
    const response = await fetch(`${base}${route}`); expect(response.status).toBe(404); expect(response.headers.get("content-type")).toContain("application/json");
  }
  const badOrigin = await fetch(`${base}/api/register`, { method: "POST", headers: { ...spoofed, origin: "https://evil.test", "content-type": "application/json" }, body: "{}" });
  expect(badOrigin.status).toBe(403);
  const key = clientKey(new Request(base, { headers: { "x-vercel-forwarded-for": "127.0.0.1" } }));
  for (let index = 0; index < 240; index++) await store.rateLimit(`api:ip:${key}`, 240, 60);
  const blocked = await fetch(`${base}/api/board`, { headers: spoofed });
  expect(blocked.status).toBe(429); expect(blocked.headers.get("retry-after")).toBe("60");
  expect(server.requestTimeout).toBe(30_000); expect(server.headersTimeout).toBe(10_000);
});
