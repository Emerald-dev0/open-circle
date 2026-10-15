import { getCommunityStore } from "../server/community-store.js";
import { finishGitHubSignIn } from "../server/github-auth.js";
import { handle } from "../server/http.js";

export function GET(req: Request): Promise<Response> {
  return handle(() => finishGitHubSignIn(req, getCommunityStore()));
}
