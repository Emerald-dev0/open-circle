import { apiHandler } from "../server/api-security.js";
import { adminAction, adminState, authorize } from "../server/admin.js";
import { getStore } from "../server/db.js";
import { json, readJson } from "../server/http.js";

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    return json(await adminState(getStore()), 200, PRIVATE);
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    return json(await adminAction(getStore(), await readJson(req)), 200, PRIVATE);
  });
}
