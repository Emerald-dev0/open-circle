const DAY_MS = 86_400_000;

/** How much verified daily history one member record keeps. */
export const ACTIVITY_HISTORY_DAYS = 400;

/** Streak lengths that earn a milestone achievement. */
export const STREAK_MILESTONES = [7, 30] as const;

export const ACHIEVEMENTS = {
  first_contribution: "First verified contribution",
  streak_7: "Seven-day streak",
  streak_30: "Thirty-day streak",
  first_help: "First confirmed help",
  community_helper_5: "Helped five members",
} as const;

export type AchievementId = keyof typeof ACHIEVEMENTS;

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];

export interface Streaks {
  current: number;
  longest: number;
}

export function isUtcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** The UTC calendar day (YYYY-MM-DD) a timestamp falls on. */
export function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Valid, de-duplicated days in order, oldest first. */
export function normalizeDays(days: readonly string[] = []): string[] {
  return [...new Set(days.filter(isUtcDay))].sort();
}

/** Unions day sets and keeps only the most recent `cap` days. */
export function mergeActivityDays(
  existing: readonly string[] = [],
  incoming: readonly string[] = [],
  cap = ACTIVITY_HISTORY_DAYS,
): string[] {
  const merged = new Set<string>();
  for (const day of existing) if (isUtcDay(day)) merged.add(day);
  for (const day of incoming) if (isUtcDay(day)) merged.add(day);
  return [...merged].sort().slice(-cap);
}

/**
 * `longest` is the running maximum, floored by any already-recorded value so
 * trimming old history never shrinks it. `current` counts consecutive UTC days
 * ending today, or yesterday when today has no activity yet.
 */
export function computeStreaks(days: readonly string[], today: string, longestFloor = 0): Streaks {
  const ordered = normalizeDays(days);
  let longest = Number.isSafeInteger(longestFloor) && longestFloor > 0 ? longestFloor : 0;
  let run = 0;
  let last = 0;
  for (const day of ordered) {
    const start = dayStart(day);
    run = last > 0 && start - last === DAY_MS ? run + 1 : 1;
    last = start;
    if (run > longest) longest = run;
  }
  const alive = isUtcDay(today) && last >= dayStart(today) - DAY_MS;
  return { current: alive ? run : 0, longest };
}

export interface ProgressionSignals {
  activityDays: readonly string[];
  longestStreak: number;
  helpfulContributions?: number;
  helpedMembers?: number;
}

/** Adds newly-earned achievements to the existing set without re-awarding. */
export function evaluateAchievements(
  signals: ProgressionSignals,
  existing: Record<string, number> = {},
  now = Date.now(),
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const [id, at] of Object.entries(existing)) {
    if (ACHIEVEMENT_IDS.includes(id as AchievementId) && Number.isSafeInteger(at)) merged[id] = at;
  }
  const award = (id: AchievementId) => {
    if (!(id in merged)) merged[id] = now;
  };
  if (normalizeDays(signals.activityDays).length > 0) award("first_contribution");
  if (signals.longestStreak >= STREAK_MILESTONES[0]) award("streak_7");
  if (signals.longestStreak >= STREAK_MILESTONES[1]) award("streak_30");
  if ((signals.helpfulContributions ?? 0) >= 1) award("first_help");
  if ((signals.helpedMembers ?? 0) >= 5) award("community_helper_5");
  return merged;
}

export function sameAchievements(a: Record<string, number> = {}, b: Record<string, number> = {}): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
