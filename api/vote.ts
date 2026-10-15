import { apiHandler } from "../server/api-security.js";
import { getStore } from "../server/db.js";
import { getCommunityStore } from "../server/community-store.js";
import { communityRateLimit, profileVote, requireSameOriginJson, visitor, vote } from "../server/community.js";
import { githubProfile, profileActor } from "../server/github-auth.js";
import { HttpError, json, readJson } from "../server/http.js";

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requireSameOriginJson(req);
    const input = await readJson(req);
    const target = (input as { target?: unknown } | null)?.target;
    if (typeof target === "string" && target.startsWith("tool:")) {
      const communityStore = getCommunityStore();
      const profile = await githubProfile(req, communityStore);
      if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to vote on tools.");
      const actor = profileActor(profile);
      await communityRateLimit(req, getStore(), actor, "vote");
      return json(await profileVote(communityStore, actor, input), 200, { "cache-control": "private, no-store", vary: "Cookie" });
    }
    const session = visitor(req, true);
    const store = getStore();
    await communityRateLimit(req, store, session.actor, "vote");
    const result = await vote(getCommunityStore(), store, session.actor, input);
    return json(result, 200, session.headers);
  });
}
