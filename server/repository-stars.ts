import type { RepositoryStar } from "../shared/repository-stars.js";
import { HttpError } from "./http.js";

async function starsGraphql(token: string, query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "OpenCircle", "x-github-api-version": "2026-03-10" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new HttpError(502, "github_stars_unavailable", "GitHub stars are unavailable. Try again.");
  }
  if ((response.status === 403 && response.headers.has("retry-after")) || response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0")
    throw new HttpError(429, "rate_limited", "GitHub is busy. Try again in a minute.", undefined, { "retry-after": "60" });
  if (response.status === 401 || response.status === 403)
    throw new HttpError(403, "github_stars_permission", "Reconnect GitHub to enable stars.");
  const body = await response.json().catch(() => null) as { data?: Record<string, unknown>; errors?: { type?: string }[] } | null;
  if (body?.errors !== undefined && !Array.isArray(body.errors))
    throw new HttpError(502, "github_stars_unavailable", "GitHub stars could not load. Try again.");
  if (body?.errors?.some((error) => ["FORBIDDEN", "UNAUTHORIZED", "INSUFFICIENT_SCOPES"].includes(error?.type ?? "")))
    throw new HttpError(403, "github_stars_permission", "Reconnect GitHub to enable stars.");
  if (!response.ok || body?.errors?.length || !body?.data || typeof body.data !== "object" || Array.isArray(body.data))
    throw new HttpError(502, "github_stars_unavailable", "GitHub stars could not update. Try again.");
  return body.data;
}

function repositoryStar(node: unknown, id: string): RepositoryStar {
  const repo = node as { id?: unknown; isPrivate?: unknown; viewerHasStarred?: unknown; stargazerCount?: unknown } | null;
  if (!repo || repo.id !== id || repo.isPrivate !== false)
    throw new HttpError(404, "repository_unavailable", "That public repository is no longer available.");
  if (typeof repo.viewerHasStarred !== "boolean" || !Number.isSafeInteger(repo.stargazerCount) || Number(repo.stargazerCount) < 0)
    throw new HttpError(502, "github_stars_unavailable", "GitHub stars could not load. Try again.");
  return { id, starred: repo.viewerHasStarred, stars: Number(repo.stargazerCount) };
}

const FIELDS = "id isPrivate viewerHasStarred stargazerCount";

export async function readRepositoryStars(token: string, ids: string[]): Promise<RepositoryStar[]> {
  if (!ids.length) return [];
  const data = await starsGraphql(token, `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository { ${FIELDS} } } }`, { ids });
  if (!Array.isArray(data.nodes) || data.nodes.length !== ids.length)
    throw new HttpError(502, "github_stars_unavailable", "GitHub stars could not load. Try again.");
  return data.nodes.map((node, index) => repositoryStar(node, ids[index]));
}

export async function setRepositoryStar(token: string, id: string, active: boolean): Promise<RepositoryStar> {
  const [current] = await readRepositoryStars(token, [id]);
  if (current.starred === active) return current;
  const action = active ? "addStar" : "removeStar";
  const data = await starsGraphql(token, `mutation($id: ID!) { ${action}(input: { starrableId: $id }) { starrable { ... on Repository { ${FIELDS} } } } }`, { id });
  const result = data[action] as { starrable?: unknown } | null;
  const updated = repositoryStar(result?.starrable, id);
  if (updated.starred !== active) throw new HttpError(502, "github_stars_unavailable", "GitHub did not confirm your star. Try again.");
  return updated;
}
