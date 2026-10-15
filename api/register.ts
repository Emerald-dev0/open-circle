import { apiHandler } from "../server/api-security.js";
import { register } from "../server/board.js";
import { getStore } from "../server/db.js";
import { json, readJson } from "../server/http.js";
import { enforcePublicRateLimit } from "../server/rate-limit.js";

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const body = await readJson(req);
    const store = getStore();
    const github = (body as { github?: unknown } | null)?.github;
    await enforcePublicRateLimit(req, store, "register", github);
    const result = await register(store, body);
    return json(result, 200, { "cache-control": "no-store" });
  });
}
