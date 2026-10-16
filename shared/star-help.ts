import type { GithubStar } from "./types.js";
import { rankingWindowStart, type RankingPeriod } from "./coordination.js";

export const STAR_HELP_POINTS = 20;

export function communityStarHelps(
  login: string,
  stars: readonly GithubStar[],
  members: ReadonlySet<string>,
  now: number,
  period: RankingPeriod = "all",
): number {
  const recipients = new Map<string, number>();
  const cutoff = rankingWindowStart(period, now);
  for (const star of stars) {
    const owner = star.ownerLogin.toLowerCase();
    if (owner !== login.toLowerCase() && members.has(owner) && Number.isSafeInteger(star.starredAt) && star.starredAt > 0 && star.starredAt <= now) {
      recipients.set(owner, Math.min(recipients.get(owner) ?? Infinity, star.starredAt));
    }
  }
  return [...recipients.values()].filter((at) => at > cutoff).length;
}
