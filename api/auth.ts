import { getCommunityStore } from "../server/community-store.js";
import { requireSameOriginJson } from "../server/community.js";
import { signOutGitHub } from "../server/github-auth.js";
import { handle, json } from "../server/http.js";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    requireSameOriginJson(req);
    const clear = await signOutGitHub(req, getCommunityStore());
    return json({ ok: true }, 200, { "set-cookie": clear, "cache-control": "private, no-store" });
  });
}
