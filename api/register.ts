import { register } from "../server/board.js";
import { getStore } from "../server/db.js";
import { handle, json, readJson } from "../server/http.js";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const result = await register(getStore(), await readJson(req));
    return json(result, 200, { "cache-control": "no-store" });
  });
}
