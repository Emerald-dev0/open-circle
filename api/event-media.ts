import { eventApiHandler, eventReader, readEvent, EVENT_HEADERS } from "../server/events.js";
import { streamEventAsset } from "../server/event-storage.js";
import { HttpError } from "../server/http.js";
export function GET(req: Request) { return eventApiHandler(req, async () => {
  await eventReader(req); const u = new URL(req.url); const event = await readEvent(u.searchParams.get("slug") ?? "", u.searchParams.get("admin") === "1"); const id = u.searchParams.get("asset");
  const asset = [event.cover, event.recording, ...event.files.filter(f => event.content.resources.some(r => r.assetId === f.id))].find(a => a?.id === id);
  if (!asset) throw new HttpError(404, "asset_missing", "This file is no longer available.");
  const range = req.headers.get("range"); if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new HttpError(416, "range_invalid", "Choose one valid byte range.", undefined, { "content-range": `bytes */${asset.size}` });
  try {
    const { object, close } = await streamEventAsset(asset.key, range); const source = object.Body!.transformToWebStream().getReader();
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) { try { const v = await source.read(); if (v.done) { controller.close(); close(); } else controller.enqueue(v.value); } catch (e) { controller.error(e); close(); } }, async cancel() { try { await source.cancel(); } finally { close(); } } });
    const headers = new Headers({ ...EVENT_HEADERS, "content-type": asset.contentType, "content-length": String(object.ContentLength), "accept-ranges": "bytes", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'", "cross-origin-resource-policy": "same-origin", "content-disposition": asset.kind === "resource" ? `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename.replace(/[\r\n]/g,""))}` : "inline" });
    if (object.ContentRange) headers.set("content-range", object.ContentRange);
    return new Response(stream, { status: object.ContentRange ? 206 : 200, headers });
  } catch (e) { const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode; if (status === 416) throw new HttpError(416, "range_invalid", "That range is outside the file.", undefined, { "content-range": `bytes */${asset.size}` }); if (status === 404) throw new HttpError(404, "asset_missing", "This file is unavailable. Contact an organiser."); throw e; }
}); }
