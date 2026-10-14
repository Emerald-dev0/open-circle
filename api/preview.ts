import { previewProfile } from "../server/board.js";
import { getStore } from "../server/db.js";
import { handle, json } from "../server/http.js";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const input = new URL(req.url).searchParams.get("u") ?? "";
    const preview = await previewProfile(getStore(), input);
    // Public GitHub numbers; a couple of minutes old is fine for a preview.
    return json(preview, 200, {
      "cache-control": "public, max-age=60",
      "vercel-cdn-cache-control": "max-age=120",
    });
  });
}
