import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrations";
import { PostgresEventStore, LocalEventStore } from "../server/event-store";
import { emptyEvent, type EventRecord, type EventUpload } from "../shared/events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const url = process.env.EVENTS_TEST_DATABASE_URL;
const record = (): EventRecord => ({ id:randomUUID(),slug:randomUUID(),content:{ ...emptyEvent(),title:"Session" },published:false,version:1,cover:null,recording:null,files:[],createdAt:Date.now(),updatedAt:Date.now(),createdBy:42 });
const upload = (event: EventRecord, kind: EventUpload["kind"] = "recording"): EventUpload => ({ id:randomUUID(),eventId:event.id,adminId:42,key:`events/${event.id}/${randomUUID()}`,multipartId:"upload",kind,title:"Session recording",filename:"video.mp4",size:200,contentType:"video/mp4",duration:123,state:"uploading",createdAt:Date.now() });
it("persists local drafts, media and resources across store restarts with atomic version checks", async () => {
  const dir = mkdtempSync(path.join(tmpdir(),"opencircle-events-store-")); const file = path.join(dir,"events.json");
  try {
    const store = new LocalEventStore(file); const event = record(); await store.save(event,0); const pending = upload(event); await store.addUpload(pending); await store.finish(pending.id);
    const restarted = new LocalEventStore(file); expect((await restarted.read(event.slug))?.recording).toMatchObject({ id:pending.id,duration:123 }); expect((await restarted.upload(pending.id))?.state).toBe("complete"); await expect(restarted.save({ ...event,version:2 },1)).rejects.toMatchObject({ status:409 });
  } finally { rmSync(dir,{ recursive:true,force:true }); }
});
describe.skipIf(!url)("Events real Postgres persistence", () => {
  let pool: Pool; let store: PostgresEventStore;
  beforeAll(async () => { const parsed = new URL(url!); if (!['localhost','127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.startsWith('/opencircle_events_test_')) throw Error('Use a disposable local Events database.'); pool = new Pool({ connectionString:url,max:2 }); const c = await pool.connect(); try { expect(await runMigrations(c)).toContain('006_events.sql'); expect(await runMigrations(c)).toEqual([]); } finally { c.release(); } store = new PostgresEventStore(pool); });
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
});
