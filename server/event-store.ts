import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { EVENT_REGISTRATION_PAGE_SIZE, eventRegistrationOpen, type EventContent, type EventRecord, type EventUpload, type EventAsset, type EventRegistration, type EventRegistrationPage } from "../shared/events.js";
import { createPostgresPool } from "./postgres.js";
import { HttpError } from "./http.js";
import { eventLookupId } from "./event-slug.js";
export interface EventStore {
  list(admin: boolean): Promise<EventRecord[]>;
  read(slug: string): Promise<EventRecord | null>;
  save(record: EventRecord, version: number): Promise<EventRecord>;
  addUpload(upload: EventUpload): Promise<EventUpload>;
  upload(id: string): Promise<EventUpload | null>;
  finish(id: string, abort?: boolean): Promise<EventRecord>;
  registration(eventId: string, memberId: number): Promise<EventRegistration | null>;
  register(registration: EventRegistration): Promise<EventRegistration>;
  registrations(eventId: string, page: number): Promise<EventRegistrationPage>;
}
function requireRegistrationOpen(event: EventRecord | null | undefined) {
  if (!event?.published) throw new HttpError(404, "event_missing", "This event is unavailable.");
  if (!eventRegistrationOpen(event)) throw new HttpError(409, "registration_closed", event.content.cancelled ? "This event has been cancelled." : "Registration for this event has closed.");
}
export function eventConflict(): never { throw new HttpError(409, "event_conflict", "This event changed. Reload it before saving again."); }
function applyUpload(event: EventRecord, upload: EventUpload, abort: boolean) {
  if (upload.state === "complete") return;
  if (upload.state === "aborted") throw new HttpError(409, "upload_aborted", "This upload was cancelled. Choose the file again.");
  if (abort) { upload.state = "aborted"; return; }
  if (upload.kind === "cover" && event.published && !event.content.coverAlt) throw new HttpError(400, "cover_alt", "Save cover alternative text before uploading a cover to a published event.");
  const asset: EventAsset = { id: upload.id, key: upload.key, kind: upload.kind, title: upload.title, filename: upload.filename, size: upload.size, contentType: upload.contentType, duration: upload.duration, uploadedBy: upload.adminId, uploadedAt: Date.now() };
  if (upload.kind === "resource") {
    if (event.content.resources.length >= 40) throw new HttpError(400, "resource_limit", "Remove a resource before adding another.");
    event.files.push(asset); event.content.resources.push({ id: upload.id, title: upload.title, description: "", url: "", assetId: upload.id });
  } else event[upload.kind] = asset;
  event.version++; event.updatedAt = Date.now(); upload.state = "complete";
}
export function validateResourceAssets(content: EventContent, saved: EventRecord | null) {
  if (content.resources.some(r => r.assetId && !saved?.files.some(f => f.id === r.assetId))) throw new HttpError(400, "resource_asset", "That file does not belong to this event.");
}
interface State { events: EventRecord[]; uploads: EventUpload[]; registrations: EventRegistration[] }
export class LocalEventStore implements EventStore {
  private data: State;
  constructor(private file: string | null = path.resolve(".data/events.json")) { const saved = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as State : { events: [], uploads: [] }; this.data = { ...saved, registrations: "registrations" in saved ? saved.registrations : [] }; }
  private persist(data: State) { if (this.file) { mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = `${this.file}.${randomUUID()}.tmp`; writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); renameSync(tmp, this.file); } this.data = data; }
  async list(admin: boolean) { return structuredClone(this.data.events.filter(e => admin || e.published).sort((a,b) => b.updatedAt-a.updatedAt)); }
  async read(slug: string) { const id = eventLookupId(slug) ?? slug; return structuredClone(this.data.events.find(e => e.slug === slug || e.id === id) ?? null); }
  async save(record: EventRecord, version: number) {
    const data = structuredClone(this.data); const index = data.events.findIndex(e => e.id === record.id); const saved = data.events[index];
    if (saved && version === 0 && saved.createdBy === record.createdBy) return structuredClone(saved);
    if ((saved?.version ?? 0) !== version) eventConflict();
    validateResourceAssets(record.content, saved ?? null);
    if (data.events.some(e => e.id !== record.id && e.slug === record.slug)) throw new HttpError(409, "event_slug_conflict", "That event address is already in use.");
    if (record.content.botSessionId && data.events.some(e => e.id !== record.id && e.content.botSessionId === record.content.botSessionId)) throw new HttpError(409, "event_exists", "That bot session already has an event page.");
    if (index >= 0) data.events[index] = record; else data.events.push(record);
    this.persist(data); return structuredClone(record);
  }
  async addUpload(upload: EventUpload) { const existing = this.data.uploads.find(u => u.id === upload.id); if (existing) return structuredClone(existing); const data = structuredClone(this.data); data.uploads.push(upload); this.persist(data); return structuredClone(upload); }
  async upload(id: string) { return structuredClone(this.data.uploads.find(u => u.id === id) ?? null); }
  async finish(id: string, abort = false) { const data = structuredClone(this.data); const upload = data.uploads.find(u => u.id === id)!; const event = data.events.find(e => e.id === upload.eventId)!; applyUpload(event, upload, abort); this.persist(data); return structuredClone(event); }
  async registration(eventId: string, memberId: number) { return structuredClone(this.data.registrations.find(r => r.eventId === eventId && r.memberId === memberId) ?? null); }
  async register(registration: EventRegistration) {
    const event = this.data.events.find(e => e.id === registration.eventId);
    if (!event?.published) throw new HttpError(404, "event_missing", "This event is unavailable.");
    const existing = this.data.registrations.find(r => r.eventId === registration.eventId && r.memberId === registration.memberId);
    if (existing) return structuredClone(existing);
    requireRegistrationOpen(event);
    const data = structuredClone(this.data); data.registrations.push(registration); this.persist(data); return structuredClone(registration);
  }
  async registrations(eventId: string, page: number) { const rows = this.data.registrations.filter(r => r.eventId === eventId).sort((a,b) => a.registeredAt-b.registeredAt || a.id.localeCompare(b.id)); return { registrations: structuredClone(rows.slice((page-1)*EVENT_REGISTRATION_PAGE_SIZE,page*EVENT_REGISTRATION_PAGE_SIZE)), total: rows.length, page, pageSize: EVENT_REGISTRATION_PAGE_SIZE }; }
}
export class PostgresEventStore implements EventStore {
  constructor(private pool: Pool) {}
  async list(admin: boolean) { const { rows } = await this.pool.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE $1 OR published ORDER BY updated_at DESC LIMIT 1000", [admin]); return rows.map(r => r.record); }
  async read(slug: string) { const { rows } = await this.pool.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE slug = $1 OR id = $2::uuid", [slug, eventLookupId(slug)]); return rows[0]?.record ?? null; }
  private async transaction<T>(run: (client: PoolClient) => Promise<T>) { const c = await this.pool.connect(); try { await c.query("BEGIN"); const value = await run(c); await c.query("COMMIT"); return value; } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); } }
  async save(record: EventRecord, version: number) { return this.transaction(async c => {
    if (version === 0) {
      validateResourceAssets(record.content, null);
      const { rows } = await c.query<{ record: EventRecord }>("INSERT INTO opencircle_events (id, slug, record, version, published, updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING record", [record.id, record.slug, JSON.stringify(record), record.version, record.published, record.updatedAt]);
      if (rows[0]) return rows[0].record;
      const saved = (await c.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE id=$1", [record.id])).rows[0]?.record;
      if (!saved || saved.createdBy !== record.createdBy) eventConflict(); return saved;
    }
    const saved = (await c.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE id=$1 FOR UPDATE", [record.id])).rows[0]?.record;
    if (!saved || saved.version !== version) eventConflict(); validateResourceAssets(record.content, saved);
    await c.query("UPDATE opencircle_events SET slug=$2,record=$3,version=$4,published=$5,updated_at=$6 WHERE id=$1", [record.id, record.slug, JSON.stringify(record), record.version, record.published, record.updatedAt]); return record;
  }); }
  async addUpload(upload: EventUpload) { const { rows } = await this.pool.query<{ record: EventUpload }>("INSERT INTO opencircle_event_uploads (id,event_id,record,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING record", [upload.id, upload.eventId, JSON.stringify(upload), upload.createdAt]); return rows[0].record; }
  async upload(id: string) { return (await this.pool.query<{ record: EventUpload }>("SELECT record FROM opencircle_event_uploads WHERE id::text=$1", [id])).rows[0]?.record ?? null; }
  async finish(id: string, abort = false) { return this.transaction(async c => {
    const entry = (await c.query<{ record: EventUpload }>("SELECT record FROM opencircle_event_uploads WHERE id::text=$1", [id])).rows[0]?.record; if (!entry) throw new HttpError(404, "upload_missing", "This upload no longer exists.");
    const event = (await c.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE id=$1 FOR UPDATE", [entry.eventId])).rows[0].record;
    const upload = (await c.query<{ record: EventUpload }>("SELECT record FROM opencircle_event_uploads WHERE id=$1 FOR UPDATE", [id])).rows[0].record;
    applyUpload(event, upload, abort);
    await c.query("UPDATE opencircle_events SET record=$2,version=$3,updated_at=$4 WHERE id=$1", [event.id, JSON.stringify(event), event.version, event.updatedAt]);
    await c.query("UPDATE opencircle_event_uploads SET record=$2 WHERE id=$1", [id, JSON.stringify(upload)]); return event;
  }); }
  async registration(eventId: string, memberId: number) { return (await this.pool.query<{ record: EventRegistration }>("SELECT record FROM opencircle_event_registrations WHERE event_id=$1 AND member_id=$2", [eventId, memberId])).rows[0]?.record ?? null; }
  async register(registration: EventRegistration) { return this.transaction(async c => {
    const event = (await c.query<{ record: EventRecord }>("SELECT record FROM opencircle_events WHERE id=$1 FOR UPDATE", [registration.eventId])).rows[0]?.record;
    if (!event?.published) throw new HttpError(404, "event_missing", "This event is unavailable.");
    const existing = (await c.query<{ record: EventRegistration }>("SELECT record FROM opencircle_event_registrations WHERE event_id=$1 AND member_id=$2", [registration.eventId, registration.memberId])).rows[0]?.record;
    if (existing) return existing;
    requireRegistrationOpen(event);
    await c.query("INSERT INTO opencircle_event_registrations (id,event_id,member_id,record,registered_at) VALUES ($1,$2,$3,$4,$5)", [registration.id, registration.eventId, registration.memberId, JSON.stringify(registration), registration.registeredAt]);
    return registration;
  }); }
  async registrations(eventId: string, page: number) {
    const total = Number((await this.pool.query<{ total: string }>("SELECT COUNT(*) AS total FROM opencircle_event_registrations WHERE event_id=$1", [eventId])).rows[0].total);
    const { rows } = await this.pool.query<{ record: EventRegistration }>("SELECT record FROM opencircle_event_registrations WHERE event_id=$1 ORDER BY registered_at,id LIMIT $2 OFFSET $3", [eventId, EVENT_REGISTRATION_PAGE_SIZE, (page-1)*EVENT_REGISTRATION_PAGE_SIZE]);
    return { registrations: rows.map(r => r.record), total, page, pageSize: EVENT_REGISTRATION_PAGE_SIZE };
  }
}
let store: EventStore | undefined;
export function getEventStore() {
  if (store) return store;
  if (process.env.DATABASE_URL) return store = new PostgresEventStore(createPostgresPool(process.env.DATABASE_URL));
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new HttpError(503, "events_storage", "Connect Postgres and apply the Events migration.");
  return store = new LocalEventStore();
}
