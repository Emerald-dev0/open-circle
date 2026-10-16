import { apiHandler } from "../server/api-security.js";
import { readBoard } from "../server/board.js";
import { getCommunityStore } from "../server/community-store.js";
import { getStore } from "../server/db.js";
import { githubSignInAvailable, sessionHash } from "../server/github-auth.js";
import { openStarAuthorization } from "../server/github-star-authorization.js";
import { HttpError, json, readJson } from "../server/http.js";
import { readRepositoryStars, setRepositoryStar } from "../server/repository-stars.js";

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };

async function authorization(req: Request) {
  const hash = sessionHash(req);
  const profile = hash && githubSignInAvailable() ? await getCommunityStore().readSession(hash) : null;
  const token = profile && hash ? openStarAuthorization(profile.starAuthorization, hash, profile.id) : null;
  return { profile, token };
}

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const ids = [...new Set(new URL(req.url).searchParams.getAll("id"))];
    if (ids.length > 20 || ids.some((id) => !/^[A-Za-z0-9_=-]{1,256}$/.test(id)))
      throw new HttpError(400, "invalid_repositories", "Choose up to 20 spotlight repositories.");
    const { token } = await authorization(req);
    if (!token) return json({ connected: false, repositories: [] }, 200, PRIVATE);
    const board = await readBoard(getStore());
    const available = new Set(board.repositories.map((repo) => repo.id));
    if (ids.some((id) => !available.has(id))) throw new HttpError(404, "not_found", "That repository is no longer in Spotlight.");
    return json({ connected: true, repositories: await readRepositoryStars(token, ids) }, 200, PRIVATE);
  });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const input = await readJson(req) as { repositoryId?: unknown; active?: unknown } | null;
    if (typeof input?.repositoryId !== "string" || !/^[A-Za-z0-9_=-]{1,256}$/.test(input.repositoryId) || typeof input.active !== "boolean")
      throw new HttpError(400, "invalid_star", "Choose a spotlight repository to star.");
    const { profile, token } = await authorization(req);
    if (!profile) throw new HttpError(401, "github_required", "Sign in with GitHub to star repositories.");
    if (!token) throw new HttpError(403, "github_stars_permission", "Connect GitHub to enable stars.");
    const store = getStore();
    if (!await store.rateLimit(`github-stars:user:${profile.id}`, 30, 60))
      throw new HttpError(429, "rate_limited", "Too many star changes. Try again in a minute.", undefined, { "retry-after": "60" });
    const board = await readBoard(store);
    if (!board.repositories.some((repo) => repo.id === input.repositoryId))
      throw new HttpError(404, "not_found", "That repository is no longer in Spotlight.");
    return json(await setRepositoryStar(token, input.repositoryId, input.active), 200, PRIVATE);
  });
}
