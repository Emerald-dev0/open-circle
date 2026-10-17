import { emptyEvent, type EventRecord, type EventView } from "../shared/events.js";
import type { ParticipationState } from "../shared/coordination.js";
import { apiHandler } from "./api-security.js";
import { authorize } from "./admin.js";
import { getCommunityStore } from "./community-store.js";
import { githubProfile } from "./github-auth.js";
import { coordinationRequest } from "./participation.js";
import { HttpError } from "./http.js";
import { getEventStore } from "./event-store.js";
import { parseEvent } from "./event-validation.js";
export const EVENT_HEADERS = { "cache-control": "private, no-store", vary: "Cookie", "referrer-policy": "no-referrer" };
export async function eventReader(req: Request) {
  if (new URL(req.url).searchParams.get("admin") === "1") return authorize(req);
  const profile = await githubProfile(req, getCommunityStore());
  if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to view community events.");
  const state = await coordinationRequest<ParticipationState>("profile", { login: profile.login });
  if (!state.activity.linked || state.activity.login?.toLowerCase() !== profile.login.toLowerCase()) throw new HttpError(403, "membership_required", "Connect your WhatsApp group account in Participation to access events.");
  if (!state.activity.tracking) throw new HttpError(503, "membership_unavailable", "The bot cannot confirm current group membership. Try again shortly.");
  return profile;
}
export function eventView(event: EventRecord): EventView {
  const asset = (v: EventRecord["cover"]) => v ? { id: v.id, kind: v.kind, title: v.title, filename: v.filename, contentType: v.contentType, size: v.size, duration: v.duration, uploadedAt: v.uploadedAt } : null;
  return { id: event.id, slug: event.slug, content: event.content, published: event.published, version: event.version, cover: asset(event.cover), recording: asset(event.recording), files: event.files.filter(f => event.content.resources.some(r => r.assetId === f.id)).map(f => asset(f)!), createdAt: event.createdAt, updatedAt: event.updatedAt };
}
export async function readEvent(slug: string, admin: boolean) {
  const event = await getEventStore().read(slug);
  if (!event || (!admin && !event.published)) throw new HttpError(404, "event_missing", "This event is unavailable.");
  return event;
}
export async function saveEvent(input: Record<string, unknown>, adminId: number) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "event_action", "Send the event details as an object.");
  if (typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) || !Number.isSafeInteger(input.version) || Number(input.version) < 0 || !["save", "publish", "unpublish"].includes(String(input.action))) throw new HttpError(400, "event_action", "Choose a valid event action.");
  const store = getEventStore(); const existing = await store.read(input.id);
  if (input.version === 0 && existing) { if (existing.createdBy !== adminId) throw new HttpError(409, "event_exists", "This event ID is already in use."); return existing; }
  const published = input.action === "publish" ? true : input.action === "unpublish" ? false : existing?.published ?? false;
  const content = parseEvent(input.content ?? existing?.content ?? emptyEvent(), published);
  if (published && existing?.cover && !content.coverAlt) throw new HttpError(400, "cover_alt", "Add alternative text for the cover image before publishing.");
  const now = Date.now();
  return store.save({ id: input.id, slug: existing?.slug ?? `${content.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g, "").slice(0,70) || "event"}-${input.id}`, content, published, version: Number(input.version) + 1, cover: existing?.cover ?? null, recording: existing?.recording ?? null, files: existing?.files ?? [], createdBy: existing?.createdBy ?? adminId, createdAt: existing?.createdAt ?? now, updatedAt: now }, Number(input.version));
}

export function eventApiHandler(req: Request, run: () => Promise<Response>) { return apiHandler(req, async () => { try { return await run(); } catch (e) { if ((e as { code?: string }).code === "23505") throw new HttpError(409, "event_exists", "That bot session or address already has an event page."); if ((e as { code?: string }).code === "42P01") throw new HttpError(503, "events_migration", "Events storage needs the latest database migrations. Saved community data is unaffected."); throw e; } }); }
