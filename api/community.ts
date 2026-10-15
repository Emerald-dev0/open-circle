import { apiHandler } from "../server/api-security.js";
import { getCommunityStore } from "../server/community-store.js";
import { readCommunity, visitor } from "../server/community.js";
import { json } from "../server/http.js";
import { githubProfile, githubSignInAvailable, profileActor } from "../server/github-auth.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const session = visitor(req);
    const store = getCommunityStore();
    const profile = await githubProfile(req, store);
    return json(await readCommunity(store, session.actor, profile, githubSignInAvailable(), profile ? profileActor(profile) : null), 200, session.headers);
  });
}
