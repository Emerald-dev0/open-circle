import type { GithubStar } from "./types.js";
import { HELPER_POLICY } from "./coordination.js";

export const STAR_HELP_POINTS = 20;

export function communityStarHelps(
  login: string,
  stars: readonly GithubStar[],
  members: ReadonlySet<string>,
  now: number,
): number {
  const recipients = new Set<string>();
  const cutoff = now - HELPER_POLICY.windowDays * 86_400_000;
  for (const star of stars) {
    const owner = star.ownerLogin.toLowerCase();
    if (owner !== login.toLowerCase() && members.has(owner) && Number.isSafeInteger(star.starredAt) && star.starredAt > cutoff && star.starredAt <= now) {
      recipients.add(owner);
    }
  }
  return recipients.size;
}
