import { apiHandler } from "../server/api-security.js";
import { forumImage } from "../server/forum-image.js";
import { readForumPreview } from "../server/forum-seo.js";
import { HttpError } from "../server/http.js";

export function GET(req: Request) {
  return apiHandler(req, async () => {
    const preview = await readForumPreview(new URL(req.url).searchParams.get("id") ?? "");
    if (!preview) throw new HttpError(404, "forum_missing", "This community post is unavailable.");
    const bytes = await forumImage(preview);
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": "image/png", "content-length": String(bytes.length), "cache-control": "no-store",
      "content-disposition": "inline", "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "cross-origin",
    } });
  });
}

export async function HEAD(req: Request) {
  const response = await GET(req);
  await response.body?.cancel();
  return new Response(null, { status: response.status, headers: response.headers });
}
