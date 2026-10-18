import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalForumStore } from "../server/forum-store";
import { commandForum } from "../server/forum";
import { readForumPreview } from "../server/forum-seo";
import { MemoryCommunityStore } from "../server/community-memory";
import { createAppServer } from "../server/node-server";
import { TestStore } from "./helpers/test-store";
import { admin, alice, command, content, poll } from "./helpers/forum-contract";

let forum: LocalForumStore;
let board: TestStore;
let sessions: MemoryCommunityStore;
vi.mock("../server/forum-store", async original => ({ ...await original<typeof import("../server/forum-store")>(), getForumStore: () => forum }));
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => sessions }));

let server: Server;
let base: string;
let directory: string;
const special = { ...content, title: 'What does "git reset" do & when is it safe? $& <Git>', body: 'Use **Git** with [GitHub](https://example.com/PRIVATE_LINK).\n\nKeep `local commits` safe & read the guide.\n\n![PRIVATE_IMAGE](https://example.com/PRIVATE_IMAGE)\n\n<!-- PRIVATE_HTML -->' };

beforeEach(async () => {
  forum = new LocalForumStore(null); board = new TestStore(); sessions = new MemoryCommunityStore(null);
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-forum-seo-"));
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

function tags(html: string) {
  const document = new JSDOM(html).window.document;
  return { document, meta: (key: string) => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute("content") };
}

it.each(["question", "discussion"] as const)("shares published %s content and a real dynamic PNG with anonymous crawlers", async kind => {
  let post = await commandForum(forum, kind === "question" ? alice : admin, command({ action: "create", kind, content: special, publish: true, ...(kind === "discussion" ? { poll } : {}) }));
  if (kind === "question") post = await commandForum(forum, admin, command({ action: "review", id: post.id, version: post.version, decision: "approve", reason: "PRIVATE_REVIEW" }));
  await commandForum(forum, alice, command({ action: "comment", id: post.id, body: "PRIVATE_COMMENT" }));
  const response = await fetch(`${base}/community/${post.id}?preview=1`, { headers: { "user-agent": "WhatsApp/2.26" } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  const html = await response.text();
  const { document, meta } = tags(html);
  expect(document.title).toBe(`${special.title} · OpenCircle`);
  expect(meta("og:title")).toBe(document.title);
  expect(meta("twitter:title")).toBe(document.title);
  expect(meta("og:description")).toBe("Use Git with GitHub. Keep local commits safe & read the guide.");
  expect(meta("twitter:description")).toBe(meta("og:description"));
  expect(meta("description")).toBe(meta("og:description"));
  expect(meta("og:url")).toBe(`https://opencircle.cc/community/${post.id}`);
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(meta("og:url"));
  expect(html).not.toContain("PRIVATE_");
  expect(meta("og:image:type")).toBe("image/png");
  expect(meta("og:image:width")).toBe("1200");
  expect(meta("og:image:height")).toBe("630");
  expect(meta("og:image:alt")).toBe(`${kind === "question" ? "Question" : "Discussion"}: ${special.title}`);
  const image = new URL(meta("og:image")!);
  expect(image.origin).toBe("https://opencircle.cc");
  expect(image.searchParams.get("id")).toBe(post.id);
  expect(image.searchParams.get("v")).toMatch(/^[a-f0-9]{16}$/);
  expect(meta("twitter:image")).toBe(image.href);
  const picture = await fetch(`${base}${image.pathname}${image.search}`);
  expect(picture.status).toBe(200);
  expect(picture.headers.get("content-type")).toBe("image/png");
  expect(picture.headers.get("cache-control")).toBe("no-store");
  expect(picture.headers.get("x-content-type-options")).toBe("nosniff");
  const png = Buffer.from(await picture.arrayBuffer());
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  expect(Number(picture.headers.get("content-length"))).toBe(png.length);
  const head = await fetch(`${base}${image.pathname}${image.search}`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe(String(png.length));
  expect(await head.text()).toBe("");
  const preview = await (await fetch(`${base}/api/forum-preview?id=${post.id}`)).json();
  expect(Object.keys(preview).sort()).toEqual(["author", "category", "description", "id", "kind", "title", "version"]);
  expect(JSON.stringify(preview)).not.toContain("PRIVATE_");
  expect((await fetch(`${base}/api/forum?id=${post.id}`)).status).toBe(401);
});

it("keeps drafts, rejected questions, pending submissions, hidden posts and missing IDs out of previews", async () => {
  const draft = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content: special }));
  const pending = await commandForum(forum, alice, command({ action: "create", kind: "question", content: special }));
  const rejected = await commandForum(forum, alice, command({ action: "create", kind: "question", content: special }));
  await commandForum(forum, admin, command({ action: "review", id: rejected.id, version: rejected.version, decision: "reject", reason: "PRIVATE_REVIEW" }));
  const visible = await commandForum(forum, admin, command({ action: "create", kind: "discussion", content: special, publish: true }));
  await commandForum(forum, admin, command({ action: "moderate", id: visible.id, version: visible.version, operation: "hide", reason: "PRIVATE_REASON" }));
  const read = vi.spyOn(forum, "readPublished");
  for (const id of [draft.id, pending.id, rejected.id, visible.id, randomUUID()]) {
    const response = await fetch(`${base}/community/${id}?admin=1&preview=1`);
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).not.toContain(special.title);
    expect(tags(html).document.title).toBe("Post unavailable · OpenCircle");
    for (const endpoint of ["forum-image", "forum-preview"]) expect((await fetch(`${base}/api/${endpoint}?id=${id}&admin=1&preview=1`)).status).toBe(404);
  }
  read.mockClear();
  for (const id of ["invalid", "../private", "' OR 1=1", ""]) expect((await fetch(`${base}/api/forum-image?${new URLSearchParams({ id })}`)).status).toBe(404);
  expect(read).not.toHaveBeenCalled();
});

it("keeps the approved preview during revision review, refreshes it on approval and revokes cached images when hidden", async () => {
  const pending = await commandForum(forum, alice, command({ action: "create", kind: "question", content }));
  const approved = await commandForum(forum, admin, command({ action: "review", id: pending.id, version: pending.version, decision: "approve" }));
  const before = (await readForumPreview(approved.id))!;
  const oldImage = `${base}/api/forum-image?id=${approved.id}&v=${before.version}`;
  const oldBytes = Buffer.from(await (await fetch(oldImage)).arrayBuffer());
  const revision = await commandForum(forum, alice, command({ action: "edit", id: approved.id, version: approved.version, content: { ...content, title: "How do pull requests work?", body: "A new explanation that is PRIVATE_REVISION until it is approved." } }));
  expect(await readForumPreview(approved.id)).toEqual(before);
  const unapprovedHtml = await (await fetch(`${base}/community/${approved.id}`)).text();
  expect(unapprovedHtml).not.toContain("PRIVATE_REVISION");
  expect(unapprovedHtml).not.toContain("How do pull requests work?");
  const published = await commandForum(forum, admin, command({ action: "review", id: approved.id, version: revision.version, decision: "approve" }));
  const after = (await readForumPreview(approved.id))!;
  expect(after.title).toBe("How do pull requests work?");
  expect(after.version).not.toBe(before.version);
  const newBytes = Buffer.from(await (await fetch(`${base}/api/forum-image?id=${approved.id}&v=${after.version}`)).arrayBuffer());
  expect(newBytes.equals(oldBytes)).toBe(false);
  await commandForum(forum, admin, command({ action: "moderate", id: published.id, version: published.version, operation: "hide", reason: "Remove this preview" }));
  expect((await fetch(oldImage)).status).toBe(404);
  expect((await fetch(`${base}/api/forum-image?id=${approved.id}&v=${after.version}`)).status).toBe(404);
});

it("bounds Markdown excerpts and preserves Unicode without exposing HTML or remote image URLs", async () => {
  const post = await commandForum(forum, admin, command({ action: "create", kind: "discussion", publish: true, content: { ...content, body: "Résumé café 😀 ".repeat(70) } }));
  const preview = (await readForumPreview(post.id))!;
  expect(Array.from(preview.description)).toHaveLength(240);
  expect(preview.description.endsWith("…")).toBe(true);
  expect(preview.description).not.toMatch(/[\uD800-\uDBFF]$/u);
});

it("keeps the list and earlier private help routes generic without database preview reads", async () => {
  const read = vi.spyOn(forum, "readPublished");
  for (const address of ["/community", "/community?tab=questions", "/community/help/help_old"]) {
    const response = await fetch(`${base}${address}`);
    expect(response.status).toBe(200);
    expect(tags(await response.text()).meta("og:title")).toBe("Community · OpenCircle");
  }
  expect(read).not.toHaveBeenCalled();
});

it("returns a retryable page on storage failures without exposing errors", async () => {
  vi.spyOn(forum, "readPublished").mockRejectedValue(new Error("PRIVATE_DATABASE_ERROR"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await fetch(`${base}/community/${randomUUID()}`);
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("PRIVATE_DATABASE_ERROR");
});
