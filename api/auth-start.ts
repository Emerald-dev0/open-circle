import { getStore } from "../server/db.js";
import { beginGitHubSignIn } from "../server/github-auth.js";
import { handle, HttpError } from "../server/http.js";
import { clientKey } from "../server/rate-limit.js";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    if (!await getStore().rateLimit(`github-signin:${clientKey(req)}`, 20, 3600)) throw new HttpError(429, "rate_limited", "You've tried signing in several times. Try again later.");
    return beginGitHubSignIn(req);
  });
}
