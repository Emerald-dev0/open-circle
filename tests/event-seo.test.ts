import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyEvent, type EventRecord } from "../shared/events";
import { LocalEventStore } from "../server/event-store";
import { MemoryCommunityStore } from "../server/community-memory";
import { createAppServer } from "../server/node-server";
import { TestStore } from "./helpers/test-store";

const storage = vi.hoisted(() => ({ stream: vi.fn(), close: vi.fn() }));
vi.mock("../server/event-storage", () => ({ streamEventAsset: storage.stream, eventStorageConfigured: () => true }));
let events: LocalEventStore;
let board: TestStore;
let community: MemoryCommunityStore;
vi.mock("../server/event-store", async original => ({ ...await original<typeof import("../server/event-store")>(), getEventStore: () => events }));
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => community }));

let server: Server;
let base: string;
let directory: string;
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64");

async function event(published = true) {
  const id = randomUUID();
  const record: EventRecord = {
    id, slug: "yu48r", published, version: 1, createdBy: 42, createdAt: Date.now(), updatedAt: Date.now(),
    content: { ...emptyEvent(), title: 'Why your AI website looks off & how to fix it $& <live>', summary: 'Build a website with "taste" & care. $&', coverAlt: 'The full event poster & "details"', description: "PRIVATE_DESCRIPTION", joinUrl: "https://meet.google.com/private-meeting", instructions: "PRIVATE_INSTRUCTIONS", startsAt: Date.now()+3600000, endsAt: Date.now()+7200000 },
    cover: { id: randomUUID(), key: "PRIVATE_COVER_KEY", kind: "cover", title: "Cover", filename: "cover.png", contentType: "image/png", size: image.length, duration: null, uploadedBy: 42, uploadedAt: Date.now() },
    recording: { id: randomUUID(), key: "PRIVATE_RECORDING_KEY", kind: "recording", title: "PRIVATE_RECORDING", filename: "recording.mp4", contentType: "video/mp4", size: 100, duration: null, uploadedBy: 42, uploadedAt: Date.now() }, files: [],
  };
  return events.save(record, 0);
}

beforeEach(async () => {
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "client"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "secret");
  events = new LocalEventStore(null); board = new TestStore(); community = new MemoryCommunityStore(null);
  storage.close.mockReset();
  storage.stream.mockReset().mockImplementation(async () => ({ object: { Body: { transformToByteArray: async () => image } }, close: storage.close }));
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-event-seo-"));
  writeFileSync(path.join(directory, "index.html"), readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  server = createAppServer(directory);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP test port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("serves the event title, summary and actual cover to anonymous sharing crawlers without JavaScript", async () => {
  const saved = await event();
  await events.register({ id: randomUUID(), eventId: saved.id, memberId: 42, login: "Alice", name: "Alice", email: "PRIVATE_EMAIL@example.com", registeredAt: Date.now() });
  for (const address of [saved.slug, `old-event-title-${saved.id}`, saved.id]) {
    const response = await fetch(`${base}/events/${address}`, { headers: { "user-agent": "WhatsApp/2.26" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    const document = new JSDOM(html).window.document;
    const meta = (key: string) => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content");
    expect(document.title).toBe(saved.content.title);
    expect(meta("og:title")).toBe(saved.content.title);
    expect(meta("twitter:title")).toBe(saved.content.title);
    expect(meta("og:description")).toBe(saved.content.summary);
    expect(meta("og:url")).toBe(`https://opencircle.cc/events/${saved.slug}`);
    expect(meta("og:image:alt")).toBe(saved.content.coverAlt);
    expect(meta("og:image:width")).toBeUndefined();
    expect(meta("og:image:height")).toBeUndefined();
    const cover = new URL(meta("og:image")!);
    expect(cover.origin).toBe("https://opencircle.cc");
    expect(cover.searchParams.get("asset")).toBe(saved.cover!.id);
    expect(meta("twitter:image")).toBe(cover.href);
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain(saved.content.joinUrl);
    const picture = await fetch(`${base}${cover.pathname}${cover.search}`);
    expect(picture.status).toBe(200);
    expect(picture.headers.get("content-type")).toBe("image/png");
    expect(picture.headers.get("cache-control")).toBe("no-store");
    expect(picture.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await picture.arrayBuffer())).toEqual(image);
  }
  expect(storage.stream).toHaveBeenCalledWith(saved.cover!.key, null);
  expect(storage.close).toHaveBeenCalledTimes(3);
  const head = await fetch(`${base}/api/event-cover?slug=${saved.slug}&asset=${saved.cover!.id}`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-type")).toBe("image/png");
  expect(head.headers.get("content-length")).toBe(String(image.length));
  expect(await head.text()).toBe("");
  for (const endpoint of ["events?slug=yu48r", `event-media?slug=yu48r&asset=${saved.cover!.id}`, "event-registrations?slug=yu48r"]) expect((await fetch(`${base}/api/${endpoint}`)).status).toBe(401);
});

it("hides drafts and missing events even with preview or admin parameters", async () => {
  const draft = await event(false);
  for (const address of [draft.slug, `old-title-${draft.id}`, "missing"]) {
    const response = await fetch(`${base}/events/${address}?preview=1`);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).not.toContain(draft.content.title);
    expect(html).not.toContain(draft.cover!.id);
    expect(html).toContain("Event unavailable");
    expect((await fetch(`${base}/api/event-cover?slug=${address}&asset=${draft.cover!.id}&admin=1`)).status).toBe(404);
  }
  expect(storage.stream).not.toHaveBeenCalled();
});

it("exposes only the current cover and immediately revokes replaced or unpublished covers", async () => {
  const saved = await event();
  const coverUrl = `${base}/api/event-cover?slug=${saved.slug}&asset=${saved.cover!.id}`;
  for (const id of [saved.recording!.id, randomUUID(), ""]) expect((await fetch(`${base}/api/event-cover?slug=${saved.slug}&asset=${id}`)).status).toBe(404);
  expect(storage.stream).not.toHaveBeenCalled();
  const replaced = await events.save({ ...saved, cover: { ...saved.cover!, id: randomUUID(), key: "NEW_PRIVATE_KEY" }, version: 2 }, 1);
  expect((await fetch(coverUrl)).status).toBe(404);
  const html = await (await fetch(`${base}/events/${saved.slug}`)).text();
  expect(html).toContain(replaced.cover!.id);
  expect(html).not.toContain(saved.cover!.id);
  const newCover = `${base}/api/event-cover?slug=${saved.slug}&asset=${replaced.cover!.id}`;
  expect((await fetch(newCover)).status).toBe(200);
  await events.save({ ...replaced, published: false, version: 3 }, 2);
  expect((await fetch(newCover)).status).toBe(404);
  expect((await fetch(`${base}/events/${saved.slug}`)).status).toBe(404);
});

it("uses the standard image when no cover exists and keeps the events list generic", async () => {
  const saved = await event();
  await events.save({ ...saved, cover: null, version: 2 }, 1);
  const detail = await (await fetch(`${base}/events/${saved.slug}`)).text();
  expect(detail).toContain('property="og:image" content="https://opencircle.cc/og.png"');
  expect(detail).not.toContain("/api/event-cover");
  const list = await (await fetch(`${base}/events`)).text();
  expect(list).toContain("<title>Events · OpenCircle</title>");
  expect(list).toContain('property="og:image" content="https://opencircle.cc/og.png"');
});

it("returns a retryable response when storage is unavailable instead of a misleading successful preview", async () => {
  const error = new Error("Database unavailable");
  vi.spyOn(events, "read").mockRejectedValue(error);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(`${base}/events/yu48r`);
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain(error.message);
});

it("handles missing cover objects and closes storage on failed image reads", async () => {
  const saved = await event();
  const url = `${base}/api/event-cover?slug=${saved.slug}&asset=${saved.cover!.id}`;
  storage.stream.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
  expect((await fetch(url)).status).toBe(404);
  storage.stream.mockResolvedValueOnce({ object: { Body: { transformToByteArray: async () => { throw new Error("Image read failed"); } } }, close: storage.close });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(url);
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(storage.close).toHaveBeenCalledOnce();
});
