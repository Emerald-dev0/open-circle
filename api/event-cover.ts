import { EVENT_LIMITS } from "../shared/events.js";
import { eventApiHandler, readEvent } from "../server/events.js";
import { streamEventAsset } from "../server/event-storage.js";
import { HttpError } from "../server/http.js";

export function GET(req: Request) {
  return eventApiHandler(req, async () => {
    const url = new URL(req.url);
    const event = await readEvent(url.searchParams.get("slug") ?? "", false);
    const cover = event.cover;
    if (!cover || cover.id !== url.searchParams.get("asset") || cover.kind !== "cover" || cover.size > EVENT_LIMITS.cover || !["image/png", "image/jpeg", "image/webp"].includes(cover.contentType)) throw new HttpError(404, "cover_missing", "This event cover is unavailable.");
    try {
      const { object, close } = await streamEventAsset(cover.key, null);
      try {
        const bytes = await object.Body!.transformToByteArray();
        return new Response(new Uint8Array(bytes), { headers: {
          "content-type": cover.contentType, "content-length": String(bytes.length),
          "cache-control": "no-store", "content-disposition": "inline",
          "content-security-policy": "sandbox; default-src 'none'",
          "cross-origin-resource-policy": "cross-origin",
        } });
      } finally { close(); }
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) throw new HttpError(404, "cover_missing", "This event cover is unavailable.");
      throw error;
    }
  });
}

export async function HEAD(req: Request) {
  const response = await GET(req);
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}
