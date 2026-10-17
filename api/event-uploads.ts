import { authorize } from "../server/admin.js";
import { getEventStore } from "../server/event-store.js";
import { beginEventUpload, eventUploadPart, finishEventUpload, abortEventUpload } from "../server/event-storage.js";
import { eventApiHandler, eventView, readEvent, EVENT_HEADERS } from "../server/events.js";
import { HttpError, json, readJson } from "../server/http.js";
import { EVENT_PART_BYTES } from "../shared/events.js";
export function POST(req: Request) { return eventApiHandler(req, async () => {
  const admin = await authorize(req); const body = await readJson(req) as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "upload_action", "Send the upload details as an object.");
  if (body.action === "initiate") { const event = await readEvent(String(body.eventId), true); const upload = await beginEventUpload(event.id, admin.id, body); return json({ id: upload.id, state: upload.state, partBytes: EVENT_PART_BYTES }, 201, EVENT_HEADERS); }
  const upload = await getEventStore().upload(String(body.id));
  if (!upload || upload.adminId !== admin.id || upload.eventId !== body.eventId) throw new HttpError(404, "upload_missing", "This upload does not belong to your account and event.");
  if (body.action === "part") return json({ url: await eventUploadPart(upload, Number(body.part)) }, 200, EVENT_HEADERS);
  if (body.action === "complete") return json(eventView(await finishEventUpload(upload)), 200, EVENT_HEADERS);
  if (body.action === "abort") return json(eventView(await abortEventUpload(upload)), 200, EVENT_HEADERS);
  throw new HttpError(400, "upload_action", "Choose a valid upload action.");
}); }
