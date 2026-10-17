import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "../api/events";
import { GET as registrationsGET, POST as registrationsPOST } from "../api/event-registrations";
import { POST as uploadPOST } from "../api/event-uploads";
import { GET as mediaGET } from "../api/event-media";
import { LocalEventStore } from "../server/event-store";
import { MemoryCommunityStore } from "../server/community-memory";
import { TestStore } from "./helpers/test-store";
import { createAdminSession } from "../server/admin-session";
import { createAppServer } from "../server/node-server";
import { emptyEvent, eventTimestamp, eventLocalTime, eventStatus, EVENT_PART_BYTES, type EventView, type EventContent } from "../shared/events";
import { validateEventSignature } from "../server/event-storage";
import { sessionEvent } from "../shared/event-sessions";
import * as eventSlugs from "../server/event-slug";
const mock = vi.hoisted(() => ({ send: vi.fn(), profile: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async original => { const sdk = await original<typeof import("@aws-sdk/client-s3")>(); return { ...sdk, S3Client: class { send = mock.send; destroy() {} } }; });
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://storage.test/signed-part") }));
vi.mock("../server/participation", () => ({ coordinationRequest: mock.profile }));
let community: MemoryCommunityStore; let board: TestStore; let events: LocalEventStore; let cookie: string;
vi.mock("../server/db", () => ({ getStore: () => board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => community }));
vi.mock("../server/event-store", async original => ({ ...await original<typeof import("../server/event-store")>(), getEventStore: () => events }));
const origin = "http://localhost"; const memberToken = "b".repeat(64);
const profile = { id: 42, login: "Alice", avatarUrl: "" };
function request(pathname = "events", body?: unknown, role: "admin" | "member" | "none" = "admin") { return new Request(`${origin}/api/${pathname}`, { method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json", "x-opencircle-admin": "1", ...(role !== "none" ? { cookie: role === "admin" ? cookie : `opencircle_github=${memberToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
function content() { return { ...emptyEvent(),title:"Learn TypeScript",summary:"A beginner session",description:"Build a small project together.",host:"Alice",platform:"Google Meet",joinUrl:"https://meet.google.com/abc-defg-hij",startsAt:Date.now()+3600000,endsAt:Date.now()+7200000,coverAlt:"TypeScript session" }; }
async function save(input: Partial<{ id: string; version: number; content: EventContent; action: string }> = {}) { const r = await POST(request("events", { id:randomUUID(),version:0,content:content(),action:"save",...input })); expect(r.status).toBe(200); return r.json() as Promise<EventView>; }
beforeEach(async () => {
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID","client"); vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET","secret"); vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI",`${origin}/api/auth-callback`); vi.stubEnv("ADMIN_GITHUB_IDS","42");
  vi.stubEnv("EVENT_R2_ACCOUNT_ID","a".repeat(32)); vi.stubEnv("EVENT_R2_BUCKET_NAME",`private-${randomUUID()}`); vi.stubEnv("EVENT_R2_ACCESS_KEY_ID","access"); vi.stubEnv("EVENT_R2_SECRET_ACCESS_KEY","secret"); vi.stubEnv("EVENT_R2_API_TOKEN","read-only-api-token");
  community = new MemoryCommunityStore(null); board = new TestStore(); events = new LocalEventStore(null);
  cookie = (await createAdminSession(request(),community,profile)).split(";")[0];
  await community.createSession(createHash("sha256").update(memberToken).digest("hex"),profile,Date.now()+60000);
  mock.profile.mockReset().mockResolvedValue({ activity:{ linked:true,login:"Alice",tracking:true } }); mock.send.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ success:true,result:url.endsWith("managed") ? { enabled:false } : { domains:[] } }))));
});
it("registers members once, keeps their details private and gives only admins the attendee list", async () => {
  const event = await save({ action: "publish" });
  const url = `event-registrations?slug=${event.slug}`;
  expect((await registrationsGET(request(url, undefined, "none"))).status).toBe(401);
  const empty = await registrationsGET(request(url, undefined, "member"));
  expect(empty.headers.get("cache-control")).toBe("private, no-store");
  expect(await empty.json()).toEqual({ registration: null });
  const body = { slug: event.slug, name: " Alice Builder ", email: " alice@example.com ", memberId: 99, login: "SomeoneElse" };
  const responses = await Promise.all(Array.from({ length: 4 }, () => registrationsPOST(request("event-registrations", body, "member"))));
  expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200]);
  const registrations = await Promise.all(responses.map(r => r.json()));
  expect(new Set(registrations.map(r => r.registration.id)).size).toBe(1);
  expect(registrations[0].registration).toMatchObject({ memberId: 42, login: "Alice", name: "Alice Builder", email: "alice@example.com" });
  expect((await registrationsGET(request(`${url}&admin=1`, undefined, "member"))).status).toBe(401);
  const adminList = await registrationsGET(request(`${url}&admin=1`));
  expect(await adminList.json()).toMatchObject({ total: 1, registrations: [registrations[0].registration] });
  const visible = await GET(request(`events?slug=${event.slug}`, undefined, "member"));
  expect(JSON.stringify(await visible.json())).not.toContain("alice@example.com");
  expect(await (await registrationsGET(request(url, undefined, "member"))).json()).toEqual(registrations[0]);
  const token = "c".repeat(64);
  await community.createSession(createHash("sha256").update(token).digest("hex"), { ...profile, id: 43, login: "Bob" }, Date.now() + 60000);
  mock.profile.mockResolvedValueOnce({ activity: { linked: true, login: "Bob", tracking: true } });
  const other = request(url, undefined, "member"); other.headers.set("cookie", `opencircle_github=${token}`);
  expect(await (await registrationsGET(other)).json()).toEqual({ registration: null });
});
it("validates registration fields, origin, account access, rate limits and event availability", async () => {
  const event = await save({ action: "publish" });
  const body = { slug: event.slug, name: "Alice", email: "alice@example.com" };
  for (const [input, field] of [[{ ...body, name: "  " }, "name"], [{ ...body, name: "Alice\nBuilder" }, "name"], [{ ...body, email: "bad-address" }, "email"]] as const) {
    const response = await registrationsPOST(request("event-registrations", input, "member"));
    expect(response.status).toBe(400); expect((await response.json()).error.field).toBe(field);
  }
  expect((await registrationsPOST(request("event-registrations", body, "none"))).status).toBe(401);
  const foreign = request("event-registrations", body, "member"); foreign.headers.set("origin", "https://evil.test");
  expect((await registrationsPOST(foreign)).status).toBe(403);
  const nonJson = request("event-registrations", body, "member"); nonJson.headers.set("content-type", "text/plain");
  expect((await registrationsPOST(nonJson)).status).toBe(415);
  expect((await registrationsPOST(request("event-registrations?admin=1", body))).status).toBe(400);
  mock.profile.mockResolvedValueOnce({ activity: { linked: true, login: "Alice", tracking: false } });
  expect((await registrationsPOST(request("event-registrations", body, "member"))).status).toBe(503);
  expect((await registrationsGET(request(`event-registrations?slug=${event.slug}&admin=1&page=-1`))).status).toBe(400);
  await save({ id: event.id, version: event.version, content: { ...event.content, cancelled: true } });
  expect((await registrationsPOST(request("event-registrations", body, "member"))).status).toBe(409);
  await save({ id: event.id, version: event.version + 1, action: "unpublish" });
  expect((await registrationsPOST(request("event-registrations", body, "member"))).status).toBe(404);
  const ended = await save({ action: "publish", content: { ...content(), startsAt: Date.now()-7200000, endsAt: Date.now()-3600000 } });
  expect((await registrationsPOST(request("event-registrations", { ...body, slug: ended.slug }, "member"))).status).toBe(409);
  vi.spyOn(board, "rateLimit").mockImplementation(async key => !key.startsWith("events:register:member:"));
  const limited = await registrationsPOST(request("event-registrations", body, "member"));
  expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("protects drafts, membership, admin writes, origin and cached private responses", async () => {
  const draft = await save();
  expect((await GET(request("events",undefined,"none"))).status).toBe(401);
  expect((await GET(request(`events?slug=${draft.slug}`,undefined,"member"))).status).toBe(404);
  expect((await POST(request("events",{ id:randomUUID(),version:0,content:content(),action:"publish" },"member"))).status).toBe(401);
  const foreign = request("events",{ action:"save" }); foreign.headers.set("origin","https://evil.test"); expect((await POST(foreign)).status).toBe(403);
  const noCsrf = request("events",{}); noCsrf.headers.delete("x-opencircle-admin"); expect((await POST(noCsrf)).status).toBe(403);
  mock.profile.mockResolvedValueOnce({ activity:{ linked:false,login:null } }); expect((await GET(request("events",undefined,"member"))).status).toBe(403);
  const response = await GET(request("events?admin=1")); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
});
it("creates one incomplete draft after retries, publishes, reschedules, cancels and unpublishes at the same slug", async () => {
  const id = randomUUID(); const draft = await save({ id,content:emptyEvent() as ReturnType<typeof content> });
  expect(draft.slug).toMatch(/^[a-z0-9]{5}$/);
  const retry = await save({ id }); expect(retry.id).toBe(draft.id); expect((await events.list(true))).toHaveLength(1);
  const bad = await POST(request("events",{ id,version:1,content:emptyEvent(),action:"publish" })); expect(bad.status).toBe(400);
  const published = await save({ id,version:1,action:"publish" }); expect(published.slug).toBe(draft.slug);
  const visible = await GET(request(`events?slug=${draft.slug}`,undefined,"member")); expect(visible.status).toBe(200); expect((await visible.json()).content.joinUrl).toContain("meet.google.com");
  const cancelled = await save({ id,version:2,content:{ ...content(),title:"New title",startsAt:Date.now()+8000000,endsAt:Date.now()+9000000,cancelled:true } }); expect(cancelled.slug).toBe(draft.slug); expect(eventStatus(cancelled)).toBe("Cancelled");
  expect((await POST(request("events",{ id,version:2,content:content(),action:"save" }))).status).toBe(409);
  await save({ id,version:3,action:"unpublish" }); expect((await GET(request(`events?slug=${draft.slug}`,undefined,"member"))).status).toBe(404);
});
it("retries short-address collisions without duplicating events or hiding unrelated failures", async () => {
  const generate = vi.spyOn(eventSlugs, "newEventSlug").mockReturnValueOnce("yu48r").mockReturnValueOnce("yu48r").mockReturnValueOnce("a9k2q");
  expect((await save()).slug).toBe("yu48r");
  expect((await save()).slug).toBe("a9k2q");
  expect(generate).toHaveBeenCalledTimes(3);
  expect(await events.list(true)).toHaveLength(2);
  generate.mockReturnValue("yu48r");
  const failure = await POST(request("events", { id: randomUUID(), version: 0, action: "save", content: content() }));
  expect(failure.status).toBe(503);
  expect((await failure.json()).error.code).toBe("event_address_unavailable");
  expect(await events.list(true)).toHaveLength(2);
  expect(eventSlugs.eventSlugCollision({ code: "23505", constraint: "opencircle_events_bot_session" })).toBe(false);
});
it("shortens a legacy event while preserving its old link, cover and saved registrations", async () => {
  const event = await save({ action: "publish" }); const cover = await begin(event, "cover");
  const png = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); uploadedObject(await events.upload(cover), png);
  expect((await uploadPOST(request("event-uploads", { action: "complete", eventId: event.id, id: cover }))).status).toBe(200);
  const current = (await events.read(event.id))!; const legacy = `learn-typescript-${event.id}`;
  const old = await events.save({ ...current, slug: legacy, version: current.version+1 }, current.version);
  const registered = await registrationsPOST(request("event-registrations", { slug: legacy, name: "Alice", email: "alice@example.com" }, "member"));
  const receipt = await registered.json(); expect(registered.status).toBe(200);
  const updated = await save({ id: event.id, version: old.version, action: "save", content: old.content });
  expect(updated.slug).toMatch(/^[a-z0-9]{5}$/); expect(updated.id).toBe(event.id); expect(updated.cover?.id).toBe(cover);
  const fromOld = await GET(request(`events?slug=${legacy}`, undefined, "member"));
  expect(fromOld.status).toBe(200); expect((await fromOld.json()).slug).toBe(updated.slug);
  expect((await GET(request(`events?slug=${updated.slug}`, undefined, "member"))).status).toBe(200);
  expect(await (await registrationsGET(request(`event-registrations?slug=${updated.slug}`, undefined, "member"))).json()).toEqual(receipt);
  const media = await mediaGET(request(`event-media?slug=${legacy}&asset=${cover}`, undefined, "member"));
  expect(media.status).toBe(200); await media.arrayBuffer();
  const unpublished = await save({ id: event.id, version: updated.version, action: "unpublish" });
  expect(unpublished.slug).toBe(updated.slug);
  expect((await GET(request(`events?slug=${legacy}`, undefined, "member"))).status).toBe(404);
});
async function begin(event: EventView, kind = "recording", size = 32) {
  mock.send.mockResolvedValueOnce({ UploadId:"multipart-1" }); const id = randomUUID();
  const response = await uploadPOST(request("event-uploads",{ action:"initiate",eventId:event.id,uploadId:id,kind,filename:kind === "cover" ? "cover.png" : kind === "resource" ? "notes.pdf" : "session.mp4",contentType:kind === "cover" ? "image/png" : kind === "resource" ? "application/pdf" : "video/mp4",size,title:"Session" })); expect(response.status).toBe(201); return id;
}
function uploadedObject(upload: Awaited<ReturnType<LocalEventStore["upload"]>>, bytes = Buffer.from("0000ftypisom00000000000000000000")) {
  mock.send.mockImplementation(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    if (name === "HeadObjectCommand") return { ContentLength:upload!.size,ContentType:upload!.contentType,Metadata:{ event:upload!.eventId,admin:String(upload!.adminId),upload:upload!.id } };
    if (name === "GetObjectCommand") return { ContentLength:bytes.length,ContentRange:command.input.Range ? `bytes 0-${bytes.length-1}/${upload!.size}` : undefined,Body:{ transformToByteArray:async () => bytes,transformToWebStream:() => new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) } };
    return {};
  });
}
it("attaches only validated uploads, retries completion idempotently and protects replaced and removed assets", async () => {
  const event = await save({ action:"publish" }); const id = await begin(event); const upload = await events.upload(id); uploadedObject(upload);
  const complete = () => uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id }));
  expect((await complete()).status).toBe(200); expect((await complete()).status).toBe(200);
  const attached = (await events.read(event.id))!; expect(attached.recording?.id).toBe(id); expect(attached.version).toBe(2);
  const view = await (await GET(request(`events?slug=${event.slug}`,undefined,"member"))).text(); expect(view).not.toContain(upload!.key); expect(view).not.toContain("uploadedBy");
  const replacement = await begin(event); mock.send.mockResolvedValue({ ContentLength:99,ContentType:"text/html",Metadata:{} });
  expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id:replacement }))).status).toBe(409);
  expect((await events.read(event.id))!.recording?.id).toBe(id);
  expect((await uploadPOST(request("event-uploads",{ action:"part",eventId:randomUUID(),id,part:1 }))).status).toBe(404);
  mock.send.mockResolvedValue({}); expect((await uploadPOST(request("event-uploads",{ action:"abort",eventId:event.id,id:replacement }))).status).toBe(200);
  expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id:replacement }))).status).toBe(409);
});
it("checks the storage part list and size instead of trusting browser ETags", async () => {
  const event = await save(); const id = await begin(event,"recording",EVENT_PART_BYTES+32);
  mock.send.mockImplementation(async (cmd: { constructor: { name: string } }) => { if (cmd.constructor.name === "HeadObjectCommand") throw { $metadata:{ httpStatusCode:404 } }; return { Parts:[{ PartNumber:1,Size:EVENT_PART_BYTES,ETag:"part-1" }] }; });
  expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id,parts:[{ ETag:"invented" }] }))).status).toBe(409);
  expect((await events.read(event.id))!.recording).toBeNull();
  mock.send.mockResolvedValue({});
  expect((await uploadPOST(request("event-uploads",{ action:"part",eventId:event.id,id,part:3 }))).status).toBe(400);
  expect((await uploadPOST(request("event-uploads",{ action:"part",eventId:event.id,id,part:2 }))).status).toBe(200);
});
it("fails closed for missing or public storage and preserves event details", async () => {
  const event = await save(); vi.stubEnv("EVENT_R2_API_TOKEN","");
  expect((await uploadPOST(request("event-uploads",{ action:"initiate",eventId:event.id,uploadId:randomUUID() }))).status).toBe(503);
  vi.stubEnv("EVENT_R2_API_TOKEN","read-only-api-token"); vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({ success:true,result:{ enabled:true,domains:[] } }))));
  expect((await uploadPOST(request("event-uploads",{ action:"initiate",eventId:event.id,uploadId:randomUUID() }))).status).toBe(503);
  expect((await events.read(event.id))!.content.title).toBe("Learn TypeScript");
});
it("streams authenticated byte ranges through the real Node adapter without buffering the response", async () => {
  const event = await save({ action:"publish" }); const id = await begin(event); const entry = await events.upload(id); uploadedObject(entry); await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id }));
  const dir = mkdtempSync(path.join(tmpdir(),"opencircle-events-http-")); writeFileSync(path.join(dir,"index.html"),"<html><head></head><body></body></html>");
  const server = createAppServer(dir); await new Promise<void>(r => server.listen(0,"127.0.0.1",r)); const address = server.address() as { port: number };
  vi.unstubAllGlobals();
  try {
    const url = `http://127.0.0.1:${address.port}/api/event-media?slug=${event.slug}&asset=${id}`;
    const response = await fetch(url,{ headers:{ cookie:`opencircle_github=${memberToken}`,range:"bytes=0-31" } }); expect(response.status).toBe(206); expect(response.headers.get("accept-ranges")).toBe("bytes"); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect((await response.arrayBuffer()).byteLength).toBe(32);
    expect((await fetch(url)).status).toBe(401);
    const invalid = await mediaGET(request(`event-media?slug=${event.slug}&asset=${id}`,undefined,"member")); expect(invalid.status).toBe(200); await invalid.arrayBuffer();
  } finally { await new Promise<void>((r,j) => server.close(e => e ? j(e) : r())); rmSync(dir,{ recursive:true,force:true }); }
});
it("handles midnight, timezones, status, unsafe resources and file signatures", async () => {
  const start = eventTimestamp("2026-10-20T23:30","Africa/Lagos")!; const end = eventTimestamp("2026-10-21T01:30","Africa/Lagos")!;
  expect(end-start).toBe(7200000); expect(eventLocalTime(start,"Africa/Lagos")).toBe("2026-10-20T23:30"); expect(() => eventTimestamp("2026-03-08T02:30","America/New_York")).toThrow();
  const e = await save({ content:{ ...content(),startsAt:start,endsAt:end } }); expect(eventStatus(e,end+1)).toBe("Ended"); expect(eventStatus(e,start+1)).toBe("Ongoing");
  expect((await POST(request("events",{ id:e.id,version:1,action:"save",content:{ ...e.content,joinUrl:"javascript:alert(1)" } }))).status).toBe(400);
  expect((await POST(request("events",{ id:e.id,version:1,action:"save",content:{ ...e.content,resources:[{ id:"file",title:"Foreign",description:"",url:"",assetId:randomUUID() }] } }))).status).toBe(400);
  expect(() => validateEventSignature(Buffer.from("<html>"),{ kind:"recording",contentType:"video/mp4",size:6 })).toThrow();
  expect(sessionEvent({ id:"bot-1",title:e.content.title,startsAt:start,endsAt:end },[e])?.id).toBe(e.id);
});
it("validates and attaches covers and downloadable resources, preserves failed cover replacement, and revokes removed files", async () => {
  const event = await save({ action:"publish" }); const cover = await begin(event,"cover");
  const png = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); uploadedObject(await events.upload(cover),png);
  expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id:cover }))).status).toBe(200);
  const replacement = await begin(event,"cover"); uploadedObject(await events.upload(replacement),Buffer.alloc(32)); expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id:replacement }))).status).toBe(415); expect((await events.read(event.id))!.cover?.id).toBe(cover);
  const file = await begin(event,"resource"); const pdf = Buffer.alloc(32); pdf.write("%PDF-1.7"); uploadedObject(await events.upload(file),pdf);
  const completed = await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id:file })); expect(completed.status).toBe(200); const attached = await completed.json() as EventView;
  const download = await mediaGET(request(`event-media?slug=${event.slug}&asset=${file}`,undefined,"member")); expect(download.headers.get("content-disposition")).toContain("notes.pdf"); expect(download.headers.get("content-type")).toBe("application/pdf"); await download.arrayBuffer();
  await save({ id:event.id,version:attached.version,content:{ ...attached.content,resources:[] } }); expect((await mediaGET(request(`event-media?slug=${event.slug}&asset=${file}`,undefined,"member"))).status).toBe(404);
});
it("completes all actual multipart parts and rejects other admins and stale membership", async () => {
  const event = await save({ action:"publish" }); const id = await begin(event,"recording",EVENT_PART_BYTES+32); const upload = (await events.upload(id))!; let completed = false;
  mock.send.mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string,unknown> }) => {
    if (cmd.constructor.name === "HeadObjectCommand") { if (!completed) throw { $metadata:{ httpStatusCode:404 } }; return { ContentLength:upload.size,ContentType:upload.contentType,Metadata:{ event:upload.eventId,admin:String(upload.adminId),upload:upload.id } }; }
    if (cmd.constructor.name === "ListPartsCommand") return { Parts:[{ PartNumber:1,Size:EVENT_PART_BYTES,ETag:"actual-one" },{ PartNumber:2,Size:32,ETag:"actual-two" }] };
    if (cmd.constructor.name === "CompleteMultipartUploadCommand") { expect(cmd.input.MultipartUpload).toEqual({ Parts:[{ PartNumber:1,ETag:"actual-one" },{ PartNumber:2,ETag:"actual-two" }] }); completed = true; return {}; }
    return { Body:{ transformToByteArray:async () => Buffer.from("0000ftypisom00000000000000000000") } };
  });
  expect((await uploadPOST(request("event-uploads",{ action:"complete",eventId:event.id,id }))).status).toBe(200);
  vi.stubEnv("ADMIN_GITHUB_IDS","42,43"); const otherCookie = (await createAdminSession(request(),community,{ ...profile,id:43 })).split(";")[0]; const other = request("event-uploads",{ action:"part",eventId:event.id,id,part:1 }); other.headers.set("cookie",otherCookie); expect((await uploadPOST(other)).status).toBe(404);
  mock.profile.mockResolvedValueOnce({ activity:{ linked:true,login:"Alice",tracking:false } }); expect((await mediaGET(request(`event-media?slug=${event.slug}&asset=${id}`,undefined,"member"))).status).toBe(503);
  const invalidRange = request(`event-media?slug=${event.slug}&asset=${id}`,undefined,"member"); invalidRange.headers.set("range","bytes=1-2,3-4"); expect((await mediaGET(invalidRange)).status).toBe(416);
});
