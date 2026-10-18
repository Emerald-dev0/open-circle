import type { GithubRepository } from "./types.js";

export const SPOTLIGHT_MIN_STARS = 5;
export const COMMUNITY_REPOSITORY = "opencirclehq/open-circle";

export function spotlightCandidates<T extends GithubRepository>(projects: T[]): T[] {
  return projects.filter((repo) => repo.stars >= SPOTLIGHT_MIN_STARS).sort(
    (a, b) => b.stars - a.stars || b.forks - a.forks || a.fullName.localeCompare(b.fullName),
  );
}

export function pickSpotlight<T extends GithubRepository>(projects: T[], selectedId?: string): T | undefined {
  const eligible = spotlightCandidates(projects);
  return eligible.find((repo) => repo.id === selectedId) ?? eligible[0];
}
