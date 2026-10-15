import { getStore } from "../server/db.js";
import { clientKey } from "../server/rate-limit.js";
import { HttpError } from "../server/http.js";
import { apiHandler } from "../server/api-security.js";
import { getCommunityStore } from "../server/community-store.js";
import { finishGitHubSignIn } from "../server/github-auth.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    if (!await getStore().rateLimit(`github-callback:${clientKey(req)}`, 30, 60))
      throw new HttpError(429, "rate_limited", "Too many sign-in attempts. Try again in a minute.", undefined, { "retry-after": "60" });
    return finishGitHubSignIn(req, getCommunityStore());
  });
}
