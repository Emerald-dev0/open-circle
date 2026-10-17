import { authorize } from "../server/admin.js";
import { EVENT_BODY_BYTES } from "../shared/events.js";
import { eventApiHandler, eventReader, eventView, readEvent, saveEvent, EVENT_HEADERS } from "../server/events.js";
import { getEventStore } from "../server/event-store.js";
import { eventStorageConfigured } from "../server/event-storage.js";
import { json, readJson } from "../server/http.js";
export function GET(req: Request) { return eventApiHandler(req, async () => {
  await eventReader(req); const url = new URL(req.url); const admin = url.searchParams.get("admin") === "1"; const slug = url.searchParams.get("slug");
  return json(slug ? eventView(await readEvent(slug, admin)) : { events: (await getEventStore().list(admin)).map(eventView), ...(admin ? { storageConfigured: eventStorageConfigured() } : {}) }, 200, EVENT_HEADERS);
}); }
export function POST(req: Request) { return eventApiHandler(req, async () => { const profile = await authorize(req); return json(eventView(await saveEvent(await readJson(req, EVENT_BODY_BYTES) as Record<string, unknown>, profile.id)), 200, EVENT_HEADERS); }); }
