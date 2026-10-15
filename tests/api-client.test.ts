import { afterEach, beforeEach, expect, it, vi } from "vitest";

let client: typeof import("../src/lib/api");
let policy: typeof import("../src/lib/query-policy");
beforeEach(async () => {
  vi.resetModules();
  client = await import("../src/lib/api");
  policy = await import("../src/lib/query-policy");
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("honors rate-limit wait times without blocking writes, and resumes reads when the window ends", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const limited = new Response(JSON.stringify({ error: { code: "rate_limited", message: "Wait a minute." } }), { status: 429, headers: { "retry-after": "60" } });
  const fetcher = vi.fn().mockResolvedValueOnce(limited).mockResolvedValueOnce(new Response('{"ok":true}')).mockResolvedValueOnce(new Response('{"members":[]}'));
  vi.stubGlobal("fetch", fetcher);
  let error: Error;
  try { await client.api.board(); } catch (failure) { error = failure as Error; }
  expect(error!).toMatchObject({ status: 429, retryAt: Date.now() + 60_000 });
  expect(policy.retryApiQuery(0, error!)).toBe(false);
  expect(policy.pollApi(10_000)({ state: { error: error! } })).toBe(60_000);
  await expect(client.api.board()).rejects.toBe(error!);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await client.api.signOut()).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  vi.setSystemTime(Date.now() + 60_001);
  expect(await client.api.board()).toEqual({ members: [] });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("accepts Retry-After dates and bounds invalid or excessive delays", () => {
  const now = Date.parse("2026-10-15T14:00:00Z");
  expect(client.retryAt(new Headers({ "retry-after": "Thu, 15 Oct 2026 14:02:00 GMT" }), 429, now)).toBe(now + 120_000);
  expect(client.retryAt(new Headers({ "retry-after": "0" }), 429, now)).toBe(now);
  expect(client.retryAt(new Headers({ "retry-after": "999999999999" }), 429, now)).toBe(now + 86_400_000);
  for (const value of ["bad", "-1", "1.5", ""]) expect(client.retryAt(new Headers({ "retry-after": value }), 429, now)).toBe(now + 60_000);
  expect(client.retryAt(new Headers(), 400, now)).toBeUndefined();
});

it("preserves aborts instead of reporting them as offline errors", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockImplementation(async () => { controller.abort(); throw controller.signal.reason; });
  vi.stubGlobal("fetch", fetcher);
  await expect(client.api.board(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(client.api.board(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(policy.retryApiQuery(0, controller.signal.reason)).toBe(false);
});

it("keeps valid JSON/admin headers and distinguishes network failures from permanent client errors", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"ok":true}')).mockRejectedValueOnce(new TypeError("Network unavailable"));
  vi.stubGlobal("fetch", fetcher);
  await client.api.approveTool("test-tool");
  const init = fetcher.mock.calls[0][1];
  expect(new Headers(init.headers).get("x-opencircle-admin")).toBe("1");
  expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  expect(init.body).toBe('{"id":"test-tool","action":"approve"}');
  await expect(client.api.board()).rejects.toMatchObject({ status: 0, code: "network" });
  expect(new Headers(fetcher.mock.calls[1][1].headers).has("content-type")).toBe(false);
  expect(policy.retryApiQuery(0, new client.ApiError(503, "unavailable", "Try again"))).toBe(true);
  expect(policy.retryApiQuery(2, new client.ApiError(503, "unavailable", "Try again"))).toBe(false);
  expect(policy.retryApiQuery(0, new client.ApiError(503, "unavailable", "Wait", undefined, Date.now() + 30_000))).toBe(false);
  expect(policy.retryApiQuery(0, new client.ApiError(401, "unauthorized", "Sign in"))).toBe(false);
});
