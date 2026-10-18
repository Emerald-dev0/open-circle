import { COMMUNITY_REPOSITORY, SPOTLIGHT_MIN_STARS } from "../shared/spotlight.js";
import { BRAND_NAME } from "../shared/brand.js";
import type { PublicRepository } from "../shared/types.js";
import { GithubError } from "./github.js";

interface RepositoryResponse {
  node_id: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string;
  private: boolean;
  fork: boolean;
  owner: { login: string; avatar_url: string };
}

export async function lookupCommunityRepository(): Promise<PublicRepository | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GithubError("not_configured", "GITHUB_TOKEN is not set.");
  const response = await fetch(`https://api.github.com/repos/${COMMUNITY_REPOSITORY}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "opencircle-leaderboard" },
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubError("upstream", "GitHub couldn't load the community repository.");
  const repo = await response.json() as Partial<RepositoryResponse> | null;
  if (!repo || typeof repo !== "object" || typeof repo.full_name !== "string" || repo.full_name.toLowerCase() !== COMMUNITY_REPOSITORY || typeof repo.private !== "boolean" || typeof repo.fork !== "boolean") {
    throw new GithubError("upstream", "GitHub returned incomplete community repository data.");
  }
  if (repo.private || repo.fork) return null;
  if (
    typeof repo.node_id !== "string" || !repo.node_id ||
    typeof repo.name !== "string" || repo.html_url !== `https://github.com/${COMMUNITY_REPOSITORY}` ||
    typeof repo.stargazers_count !== "number" || !Number.isSafeInteger(repo.stargazers_count) || repo.stargazers_count < 0 ||
    typeof repo.forks_count !== "number" || !Number.isSafeInteger(repo.forks_count) || repo.forks_count < 0 ||
    typeof repo.updated_at !== "string" || !Number.isFinite(Date.parse(repo.updated_at)) ||
    (repo.description !== null && typeof repo.description !== "string") ||
    (repo.language !== null && typeof repo.language !== "string") ||
    typeof repo.owner?.login !== "string" || repo.owner.login.toLowerCase() !== COMMUNITY_REPOSITORY.split("/")[0] ||
    typeof repo.owner.avatar_url !== "string" || !repo.owner.avatar_url.startsWith("https://avatars.githubusercontent.com/")
  ) {
    throw new GithubError("upstream", "GitHub returned incomplete community repository data.");
  }
  if (repo.stargazers_count < SPOTLIGHT_MIN_STARS) return null;
  return {
    id: repo.node_id,
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    updatedAt: repo.updated_at,
    ownerLogin: repo.owner.login,
    ownerNickname: BRAND_NAME,
    ownerAvatarUrl: repo.owner.avatar_url,
    rank: 0,
  };
}
