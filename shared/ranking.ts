import type { Weights } from "./types.js";

export const DEFAULT_WEIGHTS: Weights = {
  stars: 5,
  followers: 4,
  repos: 1,
  reposCap: 50,
  activity: 1,
  upvotes: 1,
};

interface Scorable {
  stars: number;
  followers: number;
  repos: number;
  activity: number;
  upvotes?: number;
}

export function scoreOf(s: Scorable, w: Weights): number {
  return (
    s.stars * w.stars +
    s.followers * w.followers +
    Math.min(s.repos, w.reposCap) * w.repos +
    s.activity * w.activity +
    (s.upvotes ?? 0) * w.upvotes
  );
}

export function contributionStart(joinedAt: number): number {
  const day = new Date(joinedAt);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

interface Standing {
  score: number;
  stars: number;
  createdAt: number;
}

/** Higher score first; ties go to more stars, then to whoever registered first. */
export function compareStanding(a: Standing, b: Standing): number {
  return b.score - a.score || b.stars - a.stars || a.createdAt - b.createdAt;
}

/**
 * Where a newcomer would land today. They register last, so any tie that
 * survives the stars check goes to the member already on the board.
 */
export function projectedRank(
  candidate: { score: number; stars: number },
  members: ReadonlyArray<{ score: number; stars: number }>,
): number {
  const ahead = members.filter(
    (m) => m.score > candidate.score || (m.score === candidate.score && m.stars >= candidate.stars),
  );
  return ahead.length + 1;
}
