import { previewProfile } from "../server/board.js";
import { getStore } from "../server/db.js";
import { handle, HttpError, json, readJson } from "../server/http.js";
import { enforcePublicRateLimit } from "../server/rate-limit.js";
import { parseNickname } from "../shared/validation.js";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const input = new URL(req.url).searchParams.get("u") ?? "";
    const store = getStore();
    await enforcePublicRateLimit(req, store, "preview", input);
    const preview = await previewProfile(store, input);
    return json(preview, 200, { "cache-control": "no-store" });
  });
}

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await readJson(req) as { github?: unknown; whatsapp?: unknown; nickname?: unknown } | null;
    const store = getStore();
    await enforcePublicRateLimit(req, store, "preview", body?.github);
    const nickname = parseNickname(typeof body?.nickname === "string" ? body.nickname : "");
    if (!nickname.ok) throw new HttpError(400, "invalid_nickname", nickname.error, "nickname");
    const preview = await previewProfile(
      store,
      typeof body?.github === "string" ? body.github : "",
      typeof body?.whatsapp === "string" ? body.whatsapp : "",
    );
    return json(preview, 200, { "cache-control": "no-store" });
  });
}
