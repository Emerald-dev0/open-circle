import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handle, json, MAX_REQUEST_BYTES, readJson } from "../server/http";
import { enforcePublicRateLimit } from "../server/rate-limit";
import { readBody } from "../server/vite-dev-api";
import { TestStore } from "./helpers/test-store";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function request(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}): Request {
  return new Request("https://opencircle.test/api/register", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

function nodeRequest(chunks: Buffer[], headers: Record<string, string> = {}): IncomingMessage {
  return Object.assign(Readable.from(chunks), { headers }) as unknown as IncomingMessage;
}

describe("Bounded JSON requests", () => {
  it("accepts a valid UTF-8 JSON payload exactly at the 4 KiB boundary", async () => {
    const body = JSON.stringify("é".repeat(2047));
    expect(Buffer.byteLength(body)).toBe(MAX_REQUEST_BYTES);

    await expect(readJson(request(body))).resolves.toBe("é".repeat(2047));
    await expect(readBody(nodeRequest([Buffer.from(body)]))).resolves.toEqual(Buffer.from(body));
  });

  it("rejects payloads over the byte limit even when their character count is smaller", async () => {
    const body = JSON.stringify("é".repeat(2048));
    expect(body.length).toBeLessThan(MAX_REQUEST_BYTES);
    const response = await handle(async () => json(await readJson(request(body))));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "too_large" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(readBody(nodeRequest([Buffer.from(body)]))).rejects.toMatchObject({ status: 413, code: "too_large" });
  });

  it("enforces the limit across streamed chunks without trusting Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3000));
        controller.enqueue(new Uint8Array(2000));
      },
      cancel() { cancelled = true; },
    });

    await expect(readJson(request(stream, { "content-length": "2" }))).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    await expect(readBody(nodeRequest([Buffer.alloc(3000), Buffer.alloc(2000)], { "content-length": "2" }))).rejects.toMatchObject({ status: 413 });
  });

  it("rejects an oversized declared body before reading it", async () => {
    const headers = { "content-length": String(MAX_REQUEST_BYTES + 1) };
    await expect(readJson(request("{}", headers))).rejects.toMatchObject({ status: 413 });
    await expect(readBody(nodeRequest([Buffer.from("{}")], headers))).rejects.toMatchObject({ status: 413 });
  });

  it("returns a stable client error for invalid JSON and malformed UTF-8", async () => {
    const invalidJson = await handle(async () => json(await readJson(request("{incomplete"))));
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toMatchObject({ error: { code: "bad_json" } });
    const malformed = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
    await expect(readJson(request(malformed))).rejects.toMatchObject({ status: 400, code: "bad_json" });
  });
});

describe("Public request limits", () => {
  it("normalizes profile links and username casing into one registration account limit across IPs", async () => {
    const store = new TestStore();
    const names = ["Octocat", "@OCTOCAT", "https://github.com/octocat", "github.com/Octocat", "octocat"];
    for (const [index, name] of names.entries()) {
      await enforcePublicRateLimit(new Request("https://opencircle.test/api/register", { headers: { "x-vercel-forwarded-for": `192.0.2.${index + 1}` } }), store, "register", name);
    }
    const response = await handle(async () => {
      await enforcePublicRateLimit(new Request("https://opencircle.test/api/register", { headers: { "x-vercel-forwarded-for": "192.0.2.99" } }), store, "register", "@Octocat");
      return json({ ok: true });
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("limits one IP even when every request uses another username, then allows the next window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const store = new TestStore();
    const req = new Request("https://opencircle.test/api/preview", { headers: { "x-forwarded-for": "203.0.113.10" } });
    for (let i = 0; i < 30; i += 1) await enforcePublicRateLimit(req, store, "preview", `member-${i}`);

    await expect(enforcePublicRateLimit(req, store, "preview", "new-member")).rejects.toMatchObject({ status: 429 });
    vi.setSystemTime(Date.now() + 60_001);
    await expect(enforcePublicRateLimit(req, store, "preview", "new-member")).resolves.toBeUndefined();
  });

  it("keeps raw IP addresses out of storage keys and keeps preview and registration limits separate", async () => {
    const store = new TestStore();
    const rateSpy = vi.spyOn(store, "rateLimit");
    const req = new Request("https://opencircle.test/api/preview", { headers: { "x-vercel-forwarded-for": "203.0.113.10", "x-forwarded-for": "spoofed" } });
    for (let i = 0; i < 10; i += 1) await enforcePublicRateLimit(req, store, "preview", "Octocat");
    await expect(enforcePublicRateLimit(req, store, "preview", "Octocat")).rejects.toMatchObject({ status: 429 });
    await expect(enforcePublicRateLimit(req, store, "register", "Octocat")).resolves.toBeUndefined();

    const keys = rateSpy.mock.calls.map(([key]) => key);
    expect(keys.some((key) => key.includes("203.0.113.10"))).toBe(false);
    expect(keys.find((key) => key.startsWith("preview:ip:"))).toMatch(/^preview:ip:[a-f0-9]{64}$/);
    expect(keys).toContain("register:username:octocat");
  });
});

describe("Production persistence", () => {
  it.each([{ NODE_ENV: "production", VERCEL: "" }, { NODE_ENV: "test", VERCEL: "1" }])("refuses to accept registrations into ephemeral storage without a database", async (environment) => {
    vi.resetModules();
    for (const variable of ["DATABASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) vi.stubEnv(variable, "");
    vi.stubEnv("NODE_ENV", environment.NODE_ENV);
    vi.stubEnv("VERCEL", environment.VERCEL);
    const { getStore } = await import("../server/db");

    expect(() => getStore()).toThrowError("Storage isn't configured yet");
  });

  it("uses Vercel KV credentials when the optional Upstash variables are blank", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://redis.opencircle.test");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    const { getStore } = await import("../server/db");
    const { RedisStore } = await import("../server/store-redis");

    expect(getStore()).toBeInstanceOf(RedisStore);
    expect(getStore()).toBe(getStore());
  });


});
