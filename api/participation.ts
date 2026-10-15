import { apiHandler } from "../server/api-security.js";
import { getCommunityStore } from "../server/community-store.js";
import { getStore } from "../server/db.js";
import { githubProfile } from "../server/github-auth.js";
import { requireSameOriginJson } from "../server/community.js";
import { HttpError, json, readJson } from "../server/http.js";
import { enforcePublicRateLimit } from "../server/rate-limit.js";
import { coordinationRequest } from "../server/participation.js";
import { parseWhatsappNumber } from "../shared/validation.js";
import type { LinkChallenge, ParticipationState } from "../shared/coordination.js";

async function signedIn(req: Request) {
  const profile = await githubProfile(req, getCommunityStore());
  if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to manage your group participation.");
  return profile;
}

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const profile = await signedIn(req);
    await enforcePublicRateLimit(req, getStore(), "preview", profile.login);
    return json(await coordinationRequest<ParticipationState>("profile", { login: profile.login }), 200, { "cache-control": "private, no-store" });
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requireSameOriginJson(req);
    const profile = await signedIn(req);
    await enforcePublicRateLimit(req, getStore(), "register", profile.login);
    const body = await readJson(req) as { action?: unknown; phone?: unknown } | null;
    if (body?.action === "link") {
      const phone = parseWhatsappNumber(typeof body.phone === "string" ? body.phone : "");
      if (!phone.ok) throw new HttpError(400, "invalid_whatsapp", phone.error, "whatsapp");
      return json(await coordinationRequest<LinkChallenge>("link", { login: profile.login, phone: phone.value }), 201, { "cache-control": "private, no-store" });
    }
    return json(await coordinationRequest<ParticipationState>("action", { login: profile.login, input: body }), 200, { "cache-control": "private, no-store" });
  });
}
