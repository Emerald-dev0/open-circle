import { adminConfigured, authorize } from "../server/admin.js";
import { clearAdminSession, requireAdminOrigin } from "../server/admin-session.js";
import { getCommunityStore } from "../server/community-store.js";
import { handle, HttpError, json } from "../server/http.js";

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    if (!adminConfigured()) return json({ configured: false, profile: null }, 200, PRIVATE);
    try {
      return json({ configured: true, profile: await authorize(req) }, 200, PRIVATE);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return json({ configured: true, profile: null }, 200, PRIVATE);
      throw error;
    }
  });
}

export function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    requireAdminOrigin(req, true);
    return json({ ok: true }, 200, { ...PRIVATE, "set-cookie": await clearAdminSession(req, getCommunityStore()) });
  });
}
