import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrations";
import { PostgresEventStore, LocalEventStore } from "../server/event-store";
import { emptyEvent, type EventRecord, type EventUpload, type EventRegistration } from "../shared/events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const url = process.env.EVENTS_TEST_DATABASE_URL;
const record = (): EventRecord => ({ id:randomUUID(),slug:randomUUID(),content:{ ...emptyEvent(),title:"Session" },published:false,version:1,cover:null,recording:null,files:[],createdAt:Date.now(),updatedAt:Date.now(),createdBy:42 });
const upload = (event: EventRecord, kind: EventUpload["kind"] = "recording"): EventUpload => ({ id:randomUUID(),eventId:event.id,adminId:42,key:`events/${event.id}/${randomUUID()}`,multipartId:"upload",kind,title:"Session recording",filename:"video.mp4",size:200,contentType:"video/mp4",duration:123,state:"uploading",createdAt:Date.now() });
const registration = (event: EventRecord, memberId = 42): EventRegistration => ({ id: randomUUID(), eventId: event.id, memberId, login: `Member${memberId}`, name: "Event Member", email: `member${memberId}@example.com`, registeredAt: Date.now() });
it("persists local drafts, media and resources across store restarts with atomic version checks", async () => {
  const dir = mkdtempSync(path.join(tmpdir(),"opencircle-events-store-")); const file = path.join(dir,"events.json");
  try {
    const store = new LocalEventStore(file); const event = record(); await store.save(event,0); const pending = upload(event); await store.addUpload(pending); await store.finish(pending.id);
    const restarted = new LocalEventStore(file); expect((await restarted.read(event.slug))?.recording).toMatchObject({ id:pending.id,duration:123 }); expect((await restarted.upload(pending.id))?.state).toBe("complete"); await expect(restarted.save({ ...event,version:2 },1)).rejects.toMatchObject({ status:409 });
  } finally { rmSync(dir,{ recursive:true,force:true }); }
});
it("persists registrations without changing event versions, handles retries and paginates the private list", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencircle-event-registration-")); const file = path.join(dir, "events.json");
  try {
    let store = new LocalEventStore(file); const event = { ...record(), published: true }; event.content.endsAt = Date.now()+3600000;
    await store.save(event, 0); const first = registration(event);
    await Promise.all([store.register(first), store.register({ ...first, id: randomUUID() })]);
    for (let memberId = 100; memberId < 151; memberId++) await store.register(registration(event, memberId));
    store = new LocalEventStore(file);
    expect(await store.registration(event.id, 42)).toEqual(first);
    expect((await store.read(event.id))?.version).toBe(1);
    expect(await store.registrations(event.id, 2)).toMatchObject({ total: 52, page: 2, pageSize: 50 });
    expect((await store.registrations(event.id, 2)).registrations).toHaveLength(2);
    await store.save({ ...event, version: 2, content: { ...event.content, cancelled: true } }, 1);
    await expect(store.register(registration(event, 200))).rejects.toMatchObject({ status: 409 });
    expect(await store.register({ ...first, id: randomUUID() })).toEqual(first);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("persists a short event address while retaining title-and-ID and UUID lookups after restart", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencircle-event-address-")); const file = path.join(dir, "events.json");
  try {
    const original = record(); original.slug = `a-legacy-title-${original.id}`;
    const store = new LocalEventStore(file); await store.save(original, 0);
    await store.save({ ...original, slug: "yu48r", version: 2 }, 1);
    const restarted = new LocalEventStore(file);
    for (const address of [original.slug, original.id, "yu48r"]) expect((await restarted.read(address))?.slug).toBe("yu48r");
    await expect(restarted.save({ ...record(), slug: "yu48r" }, 0)).rejects.toMatchObject({ code: "event_slug_conflict" });
    expect(await restarted.read(`unknown-${randomUUID()}`)).toBeNull();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
describe.skipIf(!url)("Events real Postgres persistence", () => {
  let pool: Pool; let store: PostgresEventStore;
  beforeAll(async () => { const parsed = new URL(url!); if (!['localhost','127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.startsWith('/opencircle_events_test_')) throw Error('Use a disposable local Events database.'); pool = new Pool({ connectionString:url,max:2 }); const c = await pool.connect(); try { expect(await runMigrations(c)).toContain('008_event_registrations.sql'); expect(await runMigrations(c)).toEqual([]); } finally { c.release(); } store = new PostgresEventStore(pool); });
  afterAll(async () => { await pool?.end(); });
  it("persists an event lifecycle and concurrent completion exactly once across fresh connections", async () => {
    const event = record(); expect((await Promise.all([store.save(event,0),store.save(event,0)])).map(e => e.id)).toEqual([event.id,event.id]);
    const updates = await Promise.allSettled([store.save({ ...event,version:2,published:true },1),store.save({ ...event,version:2,published:true },1)]); expect(updates.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const video = upload(event); await store.addUpload(video); await Promise.all([store.finish(video.id),store.finish(video.id)]);
    const file = upload(event,'resource'); await store.addUpload(file); await Promise.all([store.finish(file.id),store.finish(file.id)]);
    await pool.end(); pool = new Pool({ connectionString:url,max:2 }); store = new PostgresEventStore(pool);
    const loaded = (await store.read(event.slug))!; expect(loaded.recording?.id).toBe(video.id); expect(loaded.files).toHaveLength(1); expect(loaded.content.resources).toHaveLength(1); expect(loaded.version).toBe(4); expect((await store.list(false)).some(e => e.id === event.id)).toBe(true);
    const replacement = upload(loaded); await store.addUpload(replacement); await store.finish(replacement.id,true); expect((await store.read(event.slug))!.recording?.id).toBe(video.id); await expect(store.finish(replacement.id)).rejects.toMatchObject({ status:409 });
    await store.save({ ...loaded,content:{ ...loaded.content,cancelled:true },version:5,published:false },4); expect((await store.list(false)).some(e => e.id === event.id)).toBe(false); expect((await store.read(event.slug))!.content.cancelled).toBe(true);
  });
  it("serializes duplicate registrations, preserves contact details after reconnect and respects cancellation", async () => {
    const event = { ...record(), published: true }; event.content.endsAt = Date.now()+3600000;
    await store.save(event, 0); const first = registration(event);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => store.register({ ...first, id: randomUUID() })));
    expect(new Set(attempts.map(r => r.id)).size).toBe(1);
    await pool.end(); pool = new Pool({ connectionString: url, max: 2 }); store = new PostgresEventStore(pool);
    expect(await store.registration(event.id, 42)).toEqual(attempts[0]);
    expect((await store.registrations(event.id, 1)).total).toBe(1);
    expect(await store.registration(event.id, 43)).toBeNull();
    for (let memberId = 100; memberId < 151; memberId++) await store.register(registration(event, memberId));
    expect((await store.registrations(event.id, 2)).registrations).toHaveLength(2);
    await store.save({ ...event, version: 2, content: { ...event.content, cancelled: true } }, 1);
    await expect(store.register(registration(event, 200))).rejects.toMatchObject({ status: 409 });
    expect((await store.registrations(event.id, 1)).total).toBe(52);
  });
  it("updates the indexed address, preserves legacy links and rolls back short-code collisions", async () => {
    const original = record(); original.slug = `a-legacy-title-${original.id}`;
    await store.save(original, 0);
    const updated = { ...original, slug: "yu48r", version: 2 };
    await store.save(updated, 1);
    await expect(store.save({ ...record(), slug: "yu48r" }, 0)).rejects.toMatchObject({ code: "23505", constraint: "opencircle_events_slug_key" });
    await pool.end(); pool = new Pool({ connectionString: url, max: 2 }); store = new PostgresEventStore(pool);
    for (const address of [original.slug, original.id, "yu48r"]) expect(await store.read(address)).toEqual(updated);
    expect(await store.read("not-a-valid-address")).toBeNull();
    expect(await store.read(`unknown-${randomUUID()}`)).toBeNull();
  });
});
