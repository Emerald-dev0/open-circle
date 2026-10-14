import type { GithubStats } from "../shared/types.js";

export type GithubErrorCode = "not_configured" | "unauthorized" | "rate_limited" | "upstream";

export class GithubError extends Error {
  constructor(
    readonly code: GithubErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Lookup =
  | { kind: "user"; stats: GithubStats }
  | { kind: "organization" }
  | { kind: "missing" }
  | { kind: "error" };

const ENDPOINT = "https://api.github.com/graphql";
const DAY_MS = 86_400_000;
// contributionsCollection is the expensive field and GitHub resolves aliases
// roughly one after another (1–3s each for big accounts), so batches stay
// small and run side by side. 4 per query keeps it to ~15 points a minute
// for 60 members, far inside the 5,000/hour budget.
const BATCH_SIZE = 4;
const CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;

// The top 100 repos by stars cover effectively every star a person has;
// totalCount still counts all of them for the repo figure.
const OWNER_FRAGMENT = `
fragment Owner on RepositoryOwner {
  __typename
  login
  avatarUrl(size: 160)
  ... on User {
    name
    followers { totalCount }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      isFork: false
      privacy: PUBLIC
      orderBy: { field: STARGAZERS, direction: DESC }
    ) {
      totalCount
      nodes { stargazerCount }
    }
    contributionsCollection(from: $from) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
    }
  }
}`;

interface OwnerNode {
  __typename: "User" | "Organization";
  login: string;
  avatarUrl: string;
  name?: string | null;
  followers?: { totalCount: number };
  repositories?: { totalCount: number; nodes: { stargazerCount: number }[] };
  contributionsCollection?: Record<string, number>;
}

interface GraphqlResponse {
  data?: Record<string, OwnerNode | null> | null;
  errors?: { type?: string; message: string; path?: (string | number)[] }[];
}

function toStats(node: OwnerNode): GithubStats {
  const c = node.contributionsCollection ?? {};
  return {
    login: node.login,
    name: node.name ?? null,
    avatarUrl: node.avatarUrl,
    stars: (node.repositories?.nodes ?? []).reduce((sum, r) => sum + r.stargazerCount, 0),
    followers: node.followers?.totalCount ?? 0,
    repos: node.repositories?.totalCount ?? 0,
    activity:
      (c.totalCommitContributions ?? 0) +
      (c.totalIssueContributions ?? 0) +
      (c.totalPullRequestContributions ?? 0) +
      (c.totalPullRequestReviewContributions ?? 0) +
      (c.totalRepositoryContributions ?? 0),
  };
}

async function lookupBatch(logins: string[], token: string): Promise<Map<string, Lookup>> {
  const params = logins.map((_, i) => `$l${i}: String!`).join(", ");
  const fields = logins.map((_, i) => `u${i}: repositoryOwner(login: $l${i}) { ...Owner }`).join("\n  ");
  const query = `query(${params}, $from: DateTime!) {\n  ${fields}\n}\n${OWNER_FRAGMENT}`;
  const variables: Record<string, string> = { from: new Date(Date.now() - 30 * DAY_MS).toISOString() };
  logins.forEach((login, i) => (variables[`l${i}`] = login));

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "devechleon-leaderboard",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GithubError("upstream", "GitHub didn't answer in time.");
  }

  if (res.status === 401) throw new GithubError("unauthorized", "GITHUB_TOKEN was rejected by GitHub.");
  if (res.status === 403 || res.status === 429) throw new GithubError("rate_limited", "GitHub rate limit hit.");
  if (!res.ok) throw new GithubError("upstream", `GitHub responded ${res.status}.`);

  const body = (await res.json()) as GraphqlResponse;
  if (body.errors?.some((e) => e.type === "RATE_LIMITED")) {
    throw new GithubError("rate_limited", "GitHub rate limit hit.");
  }
  if (!body.data) throw new GithubError("upstream", body.errors?.[0]?.message ?? "GitHub returned no data.");

  // A field-level error for one alias shouldn't read as "account deleted".
  const failed = new Set(
    (body.errors ?? []).filter((e) => e.type !== "NOT_FOUND").map((e) => String(e.path?.[0] ?? "")),
  );

  const results = new Map<string, Lookup>();
  logins.forEach((login, i) => {
    const alias = `u${i}`;
    const node = body.data?.[alias];
    let lookup: Lookup;
    if (failed.has(alias)) lookup = { kind: "error" };
    else if (!node) lookup = { kind: "missing" };
    else if (node.__typename === "Organization") lookup = { kind: "organization" };
    else lookup = { kind: "user", stats: toStats(node) };
    results.set(login.toLowerCase(), lookup);
  });
  return results;
}

/**
 * Looks up many accounts in a handful of GraphQL calls. Batches that fail are
 * reported through `error`; the rest still come back.
 */
export async function lookupMany(logins: string[]): Promise<{ results: Map<string, Lookup>; error?: GithubError }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { results: new Map(), error: new GithubError("not_configured", "GITHUB_TOKEN is not set.") };
  }

  const batches: string[][] = [];
  for (let i = 0; i < logins.length; i += BATCH_SIZE) batches.push(logins.slice(i, i + BATCH_SIZE));

  const results = new Map<string, Lookup>();
  let error: GithubError | undefined;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const settled = await Promise.allSettled(batches.slice(i, i + CONCURRENCY).map((b) => lookupBatch(b, token)));
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") outcome.value.forEach((v, k) => results.set(k, v));
      else error ??= outcome.reason instanceof GithubError ? outcome.reason : new GithubError("upstream", String(outcome.reason));
    }
    if (error?.code === "rate_limited" || error?.code === "unauthorized") break;
  }
  return { results, error };
}

export async function lookupOne(login: string): Promise<Lookup> {
  const { results, error } = await lookupMany([login]);
  if (error) throw error;
  return results.get(login.toLowerCase()) ?? { kind: "error" };
}
