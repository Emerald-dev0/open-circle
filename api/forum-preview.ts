import { apiHandler } from "../server/api-security.js";
import { readForumPreview } from "../server/forum-seo.js";
import { HttpError, json } from "../server/http.js";

export function GET(req: Request) {
  return apiHandler(req, async () => {
    const preview = await readForumPreview(new URL(req.url).searchParams.get("id") ?? "");
    if (!preview) throw new HttpError(404, "forum_missing", "This community post is unavailable.");
    return json(preview);
  });
}
