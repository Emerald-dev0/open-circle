import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { get, type Server } from "node:http";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { conditionalJson, json } from "../server/http";
import { encodePublicJson } from "../server/http-encoding";
import { createAppServer } from "../server/node-server";
import { MemoryCommunityStore } from "../server/community-memory";
import { boardFixture, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let server: Server | undefined;
let directory: string | undefined;
beforeEach(() => { context.board = new TestStore(); context.community = new MemoryCommunityStore(null); });
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; }
  if (directory) { rmSync(directory, { force: true, recursive: true }); directory = undefined; }
  vi.unstubAllEnvs();
});

it("returns no body for unchanged public snapshots and invalidates the tag when data changes", async () => {
  const req = new Request("https://opencircle.test/api/board");
  const headers = { "cache-control": "no-cache" };
  const first = conditionalJson(req, { count: 1 }, headers);
  const tag = first.headers.get("etag")!;
  for (const match of [tag, tag.slice(2), `"unrelated", ${tag}`, "*"]) {
    const response = conditionalJson(new Request(req, { headers: { "if-none-match": match } }), { count: 1 }, headers);
    expect(response.status).toBe(304); expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe(tag);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  }
  const changed = conditionalJson(new Request(req, { headers: { "if-none-match": tag } }), { count: 2 }, headers);
  expect(changed.status).toBe(200); expect(changed.headers.get("etag")).not.toBe(tag);
  expect(await changed.json()).toEqual({ count: 2 });
});

it("compresses only eligible public JSON while honoring content negotiation and preserving private responses", async () => {
  const data = { text: "Useful public project details. ".repeat(200) };
  for (const encoding of ["gzip", "br, gzip;q=0.5", "*;q=1", " gzip ; q=0.5 "]) {
    const response = json(data, 200, { "cache-control": "no-cache", vary: "Origin" });
    const body = await encodePublicJson(response, encoding);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Origin, Accept-Encoding");
    expect(JSON.parse(gunzipSync(body).toString())).toEqual(data);
  }
  for (const encoding of ["", "gzip;q=0", "gzip;q=0, *;q=1", "gzip ;q=0, *;q=1", "br", "gzip;q=invalid"]) {
    const response = json(data, 200, { "cache-control": "no-cache" });
    expect(JSON.parse((await encodePublicJson(response, encoding)).toString())).toEqual(data);
    expect(response.headers.has("content-encoding")).toBe(false);
  }
  for (const policy of ["private, no-store", "no-store", "public, no-transform"]) {
    const response = json(data, 200, { "cache-control": policy, vary: "Cookie" });
    expect(JSON.parse((await encodePublicJson(response, "gzip")).toString())).toEqual(data);
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.get("vary")).toBe("Cookie");
  }
  const small = json({ count: 1 }, 200, { "cache-control": "no-cache" });
  await encodePublicJson(small, "gzip"); expect(small.headers.has("content-encoding")).toBe(false);
});

it("sends smaller board payloads through actual HTTP, then revalidates without downloading the list again", async () => {
  const store = context.board as TestStore;
  const board = boardFixture({ refreshedAt: Date.now() });
  const template = { ...repository(), ownerLogin: "Octocat", ownerNickname: "Octo", ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1" };
  board.repositories = Array.from({ length: 250 }, (_, index) => ({ ...template, id: `repo-${index}`, name: `project-${index}`, fullName: `Octocat/project-${index}`, rank: index + 1 }));
  await store.setBoard(board);
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-performance-"));
  writeFileSync(path.join(directory, "index.html"), "<title>OpenCircle</title>");
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${address.port}`;
  const raw = (headers: Record<string, string>) => new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    get(`${base}/api/board`, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    }).on("error", reject);
  });
  const plain = await raw({ "accept-encoding": "identity" });
  const zipped = await raw({ "accept-encoding": "gzip" });
  expect(plain.status).toBe(200); expect(zipped.status).toBe(200);
  expect(zipped.headers["content-encoding"]).toBe("gzip");
  expect(gunzipSync(zipped.body)).toEqual(plain.body);
  expect(zipped.body.length).toBeLessThan(plain.body.length / 2);
  expect(zipped.headers.etag).toBe(plain.headers.etag);
  console.info(JSON.stringify({ fixtureRepositories: 250, originalBytes: plain.body.length, gzipBytes: zipped.body.length, unchangedBytes: 0 }));
  const unchanged = await raw({ "accept-encoding": "gzip", "if-none-match": zipped.headers.etag! });
  expect(unchanged.status).toBe(304); expect(unchanged.body.length).toBe(0);
  expect(unchanged.headers["content-encoding"]).toBeUndefined();
  expect(unchanged.headers.vary).toBe("Accept-Encoding");
  await store.setBoard({ ...board, members: [], updatedAt: board.updatedAt + 1 });
  const changed = await raw({ "if-none-match": zipped.headers.etag! });
  expect(changed.status).toBe(200); expect(changed.headers.etag).not.toBe(zipped.headers.etag);
  expect(JSON.parse(changed.body.toString()).members).toEqual([]);
});
