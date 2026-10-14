import { adminAction, adminState, authorize } from "../server/admin.js";
import { getStore } from "../server/db.js";
import { handle, json, readJson } from "../server/http.js";

const PRIVATE = { "cache-control": "no-store" };

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    authorize(req);
    return json(await adminState(getStore()), 200, PRIVATE);
  });
}

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    authorize(req);
    return json(await adminAction(getStore(), await readJson(req)), 200, PRIVATE);
  });
}
