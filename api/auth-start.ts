import { apiHandler } from "../server/api-security.js";
import { getStore } from "../server/db.js";
import { beginGitHubSignIn } from "../server/github-auth.js";
import { HttpError } from "../server/http.js";
import { clientKey } from "../server/rate-limit.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    if (!await getStore().rateLimit(`github-signin:${clientKey(req)}`, 20, 3600)) throw new HttpError(429, "rate_limited", "You've tried signing in several times. Try again later.", undefined, { "retry-after": "3600" });
    return beginGitHubSignIn(req);
  });
}
