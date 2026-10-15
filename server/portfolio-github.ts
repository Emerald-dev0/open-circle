import type { GitHubProfile } from "../shared/community.js";
import type { PortfolioGitHubPage, PortfolioRepository } from "../shared/portfolio.js";
import { safePortfolioUrl } from "../shared/portfolio-validation.js";
import { HttpError } from "./http.js";

async function github(path: string): Promise<Response> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "OpenCircle", "x-github-api-version": "2026-03-10", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(10_000), redirect: "error",
    });
    if (response.status === 404) throw new HttpError(404, "repository_missing", "That public GitHub profile or repository is no longer available.");
    if (!response.ok) throw new HttpError(502, "github_unavailable", "GitHub is unavailable or rate limited. Try again shortly.");
    return response;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "github_unavailable", "Couldn't reach GitHub. Try again shortly.");
  }
}

type GitHubRepo = { id: number; name: string; full_name: string; private: boolean; owner: { id: number; login: string }; description: string | null; language: string | null; stargazers_count: number; forks_count: number; homepage: string | null; html_url: string; };

function repo(value: GitHubRepo, ownerId: number): PortfolioRepository {
  if (!value || value.private !== false || value.owner?.id !== ownerId || !Number.isSafeInteger(value.id) || typeof value.name !== "string" || typeof value.full_name !== "string") throw new HttpError(400, "repository_owner", "Choose a public repository owned by your signed-in GitHub account.", "projects");
  let homepage = "";
  try { homepage = safePortfolioUrl(value.homepage ?? ""); } catch { homepage = ""; }
  return { id: value.id, name: value.name, fullName: value.full_name, description: (value.description ?? "").slice(0, 1000), language: value.language ?? "", stars: Math.max(0, value.stargazers_count || 0), forks: Math.max(0, value.forks_count || 0), url: `https://github.com/${encodeURIComponent(value.owner.login)}/${encodeURIComponent(value.name)}`, homepage };
}

export async function listPortfolioRepositories(profile: GitHubProfile, page: number): Promise<PortfolioGitHubPage> {
  const response = await github(`/users/${encodeURIComponent(profile.login)}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new HttpError(502, "github_unavailable", "GitHub didn't return your repositories. Try again.");
  return { repositories: (data as GitHubRepo[]).filter((value) => value.private === false && value.owner?.id === profile.id).map((value) => repo(value, profile.id)), nextPage: response.headers.get("link")?.includes('rel="next"') ? page + 1 : null };
}

export async function verifyPortfolioRepository(id: number, ownerId: number): Promise<PortfolioRepository> {
  return repo(await (await github(`/repositories/${id}`)).json() as GitHubRepo, ownerId);
}

export async function portfolioGitHubDetails(profile: GitHubProfile) {
  const data = await (await github(`/users/${encodeURIComponent(profile.login)}`)).json() as Record<string, unknown>;
  if (data.id !== profile.id) throw new HttpError(409, "github_identity", "Your GitHub username changed. Sign in again to sync your profile.");
  return { displayName: typeof data.name === "string" ? data.name.slice(0, 80) : profile.login, bio: typeof data.bio === "string" ? data.bio.slice(0, 500) : "", location: typeof data.location === "string" ? data.location.slice(0, 80) : "" };
}

export async function portfolioRepositoryReadme(id: number, ownerId: number): Promise<string> {
  const repository = await verifyPortfolioRepository(id, ownerId);
  const response = await github(`/repos/${repository.fullName.split("/").map(encodeURIComponent).join("/")}/readme`);
  const data = await response.json() as { content?: unknown; encoding?: unknown; size?: number };
  if (data.encoding !== "base64" || typeof data.content !== "string" || data.content.length > 40_000) throw new HttpError(400, "readme_size", "That README is too large to import. Paste a shorter version instead.");
  const readme = Buffer.from(data.content, "base64").toString("utf8");
  if (readme.length > 20_000) throw new HttpError(400, "readme_size", "Keep your README within 20,000 characters.");
  const file = await (await github(`/repos/${repository.fullName.split("/").map(encodeURIComponent).join("/")}`)).json() as { default_branch?: string };
  const base = `https://raw.githubusercontent.com/${repository.fullName}/${encodeURIComponent(file.default_branch ?? "HEAD")}/`;
  return readme.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g, (_match, start: string, target: string, end: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return `${start}${target}${end}`;
    return `${start}${new URL(target.replace(/^\//, ""), base).href}${end}`;
  });
}
