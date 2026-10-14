import type { GithubRepository, GithubStats } from "../shared/types.js";

export type GithubErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "upstream";

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

type Outcome = { results: Map<string, Lookup>; error?: GithubError };
const ENDPOINT = "https://api.github.com/graphql";
const BATCH_SIZE = 4;
const CONCURRENCY = 3;
const TIMEOUT_MS = 20_000;

const REPO_FIELDS = `
  totalCount
  pageInfo { hasNextPage endCursor }
  nodes {
    id name nameWithOwner url description stargazerCount forkCount updatedAt
    isPrivate isFork
    primaryLanguage { name }
  }
`;
const REPO_ARGS = `first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
  orderBy: { field: STARGAZERS, direction: DESC }`;
const OWNER_FRAGMENT = `
fragment Owner on RepositoryOwner {
  __typename login avatarUrl(size: 160)
  ... on User {
    name
    followers { totalCount }
    repositories(${REPO_ARGS}) { ${REPO_FIELDS} }
    contributionsCollection(from: $from) {
      totalCommitContributions totalIssueContributions
      totalPullRequestContributions totalPullRequestReviewContributions
      totalRepositoryContributions
    }
  }
}`;

interface RepoNode {
  id: string;
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  updatedAt: string;
  isPrivate: boolean;
  isFork: boolean;
  primaryLanguage: { name: string } | null;
}
interface RepoConnection {
  totalCount: number;
  nodes: (RepoNode | null)[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
interface OwnerNode {
  __typename: "User" | "Organization";
  login: string;
  avatarUrl: string;
  name?: string | null;
  followers?: { totalCount: number };
  repositories?: RepoConnection;
  contributionsCollection?: Record<string, number>;
}
interface GraphqlResponse {
  data?: Record<string, OwnerNode | null> | null;
  errors?: { type?: string; message: string; path?: (string | number)[] }[];
}

async function queryGithub(
  query: string,
  variables: Record<string, string>,
  token: string,
  deadline: number,
): Promise<GraphqlResponse> {
  const remaining = deadline - Date.now();
  if (remaining < 1000)
    throw new GithubError(
      "upstream",
      "GitHub refresh will continue on the next cycle.",
    );
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "opencircle-leaderboard",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
    });
  } catch {
    throw new GithubError("upstream", "GitHub didn't answer in time.");
  }
  if (res.status === 401)
    throw new GithubError(
      "unauthorized",
      "GITHUB_TOKEN was rejected by GitHub.",
    );
  if (res.status === 403 || res.status === 429)
    throw new GithubError("rate_limited", "GitHub rate limit hit.");
  if (!res.ok)
    throw new GithubError("upstream", `GitHub responded ${res.status}.`);
  const body = (await res.json()) as GraphqlResponse;
  if (body.errors?.some((e) => e.type === "RATE_LIMITED")) {
    throw new GithubError("rate_limited", "GitHub rate limit hit.");
  }
  if (!body.data)
    throw new GithubError(
      "upstream",
      body.errors?.[0]?.message ?? "GitHub returned no data.",
    );
  return body;
}

function toProject(repo: RepoNode): GithubRepository {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.nameWithOwner,
    url: repo.url,
    description: repo.description,
    stars: repo.stargazerCount,
    forks: repo.forkCount,
    language: repo.primaryLanguage?.name ?? null,
    updatedAt: repo.updatedAt,
  };
}

async function allProjects(
  node: OwnerNode,
  token: string,
  deadline: number,
): Promise<GithubRepository[]> {
  let connection = node.repositories;
  const projects = new Map<string, GithubRepository>();
  const cursors = new Set<string>();
  while (connection) {
    for (const repo of connection.nodes) {
      if (repo && !repo.isPrivate && !repo.isFork)
        projects.set(repo.id, toProject(repo));
    }
    if (!connection.pageInfo.hasNextPage) break;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor))
      throw new GithubError(
        "upstream",
        "GitHub returned an incomplete repository page.",
      );
    cursors.add(cursor);
    const body = await queryGithub(
      `query($login: String!, $after: String!) {
        user(login: $login) { repositories(${REPO_ARGS}, after: $after) { ${REPO_FIELDS} } }
      }`,
      { login: node.login, after: cursor },
      token,
      deadline,
    );
    if (body.errors?.length || !body.data?.user?.repositories) {
      throw new GithubError(
        "upstream",
        "GitHub couldn't load all public repositories.",
      );
    }
    connection = body.data.user.repositories;
  }
  return [...projects.values()];
}

async function lookupBatch(
  logins: string[],
  token: string,
  deadline: number,
): Promise<Outcome> {
  const params = logins.map((_, i) => `$l${i}: String!`).join(", ");
  const fields = logins
    .map((_, i) => `u${i}: repositoryOwner(login: $l${i}) { ...Owner }`)
    .join("\n");
  const variables: Record<string, string> = {
    from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  };
  logins.forEach((login, i) => (variables[`l${i}`] = login));
  const body = await queryGithub(
    `query(${params}, $from: DateTime!) { ${fields} } ${OWNER_FRAGMENT}`,
    variables,
    token,
    deadline,
  );
  const failed = new Set(
    (body.errors ?? [])
      .filter((e) => e.type !== "NOT_FOUND")
      .map((e) => String(e.path?.[0] ?? "")),
  );
  const results = new Map<string, Lookup>();
  let error: GithubError | undefined;

  await Promise.all(
    logins.map(async (login, i) => {
      const alias = `u${i}`;
      const node = body.data?.[alias];
      let result: Lookup;
      if (failed.has(alias) || failed.has("")) result = { kind: "error" };
      else if (!node) result = { kind: "missing" };
      else if (node.__typename === "Organization")
        result = { kind: "organization" };
      else {
        try {
          const projects = await allProjects(node, token, deadline);
          const contributions = node.contributionsCollection ?? {};
          result = {
            kind: "user",
            stats: {
              login: node.login,
              name: node.name ?? null,
              avatarUrl: node.avatarUrl,
              stars: projects.reduce((sum, repo) => sum + repo.stars, 0),
              followers: node.followers?.totalCount ?? 0,
              repos: node.repositories?.totalCount ?? 0,
              activity: Object.values(contributions).reduce(
                (sum, count) => sum + count,
                0,
              ),
              projects,
            },
          };
        } catch (err) {
          error ??=
            err instanceof GithubError
              ? err
              : new GithubError(
                  "upstream",
                  "GitHub couldn't load repositories.",
                );
          result = { kind: "error" };
        }
      }
      if (result.kind === "error")
        error ??= new GithubError(
          "upstream",
          "GitHub couldn't load a profile.",
        );
      results.set(login.toLowerCase(), result);
    }),
  );
  return { results, error };
}

export async function lookupMany(logins: string[]): Promise<Outcome> {
  const token = process.env.GITHUB_TOKEN;
  if (!token)
    return {
      results: new Map(),
      error: new GithubError("not_configured", "GITHUB_TOKEN is not set."),
    };
  const batches: string[][] = [];
  for (let i = 0; i < logins.length; i += BATCH_SIZE)
    batches.push(logins.slice(i, i + BATCH_SIZE));
  const results = new Map<string, Lookup>();
  let error: GithubError | undefined;
  const deadline = Date.now() + 35_000;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const settled = await Promise.allSettled(
      batches
        .slice(i, i + CONCURRENCY)
        .map((b) => lookupBatch(b, token, deadline)),
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        outcome.value.results.forEach((value, key) => results.set(key, value));
        error ??= outcome.value.error;
      } else {
        error ??=
          outcome.reason instanceof GithubError
            ? outcome.reason
            : new GithubError("upstream", "GitHub lookup failed.");
      }
    }
    if (error?.code === "rate_limited" || error?.code === "unauthorized") break;
  }
  return { results, error };
}

export async function lookupOne(login: string): Promise<Lookup> {
  const { results, error } = await lookupMany([login]);
  const result = results.get(login.toLowerCase());
  if (result && result.kind !== "error") return result;
  if (error) throw error;
  return { kind: "error" };
}
