import type { HelperPeriodScores } from "../shared/coordination.js";
import type {
  Board,
  GithubRepository,
  GithubStar,
  InviteConfig,
  Weights,
} from "../shared/types.js";

export interface MemberRecord {
  /** Lowercased GitHub login; the primary key. */
  login: string;
  /** GitHub's casing, for display. */
  displayLogin: string;
  nickname: string;
  /** E.164. Only the admin API ever returns it. */
  whatsapp: string;
  avatarUrl: string;
  name: string | null;
  stars: number;
  followers: number;
  repos: number;
  activity: number;
  helperPoints?: number;
  helpfulContributions?: number;
  helpedMembers?: number;
  helperPeriods?: HelperPeriodScores;
  activitySince?: number;
  projects?: GithubRepository[];
  starredRepositories?: GithubStar[];
  starSupportUpdatedAt?: number;
  starHistoryVersion?: number;
  spotlightRepositoryId?: string;
  hidden: boolean;
  createdAt: number;
  statsUpdatedAt: number;
  /** Rank at the last board build; 0 when hidden or never placed. */
  rank: number;
  prevRank: number;
  rankChangedAt: number;
}

export interface AppConfig {
  invite: InviteConfig;
  weights: Weights;
}

export type Conflict = "github" | "whatsapp" | "nickname";
export type CreateResult = { ok: true } | { ok: false; conflict: Conflict };

export interface Store {
  listMembers(): Promise<MemberRecord[]>;
  getMember(login: string): Promise<MemberRecord | null>;
  /** Claims the GitHub login, number and nickname atomically, or reports which one is taken. */
  createMember(member: MemberRecord): Promise<CreateResult>;
  /** No-op if the member was deleted in the meantime. */
  patchMember(login: string, patch: Partial<MemberRecord>): Promise<void>;
  deleteMember(login: string): Promise<void>;
  getConfig(): Promise<Partial<AppConfig> | null>;
  setConfig(config: AppConfig): Promise<void>;
  getBoard(): Promise<Board | null>;
  setBoard(board: Board): Promise<void>;
  tryLock(name: string, ttlSeconds: number): Promise<boolean>;
  unlock(name: string): Promise<void>;
  rateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean>;
}

const NUMERIC = [
  "stars",
  "followers",
  "repos",
  "activity",
  "helperPoints",
  "helpfulContributions",
  "helpedMembers",
  "activitySince",
  "starSupportUpdatedAt",
  "starHistoryVersion",
  "createdAt",
  "statsUpdatedAt",
  "rank",
  "prevRank",
  "rankChangedAt",
] as const;

/** Flattens a record (or patch) into string fields for a Redis hash. */
export function encodeMember(
  patch: Partial<MemberRecord>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) || key === "helperPeriods"
      ? JSON.stringify(value)
      : typeof value === "boolean"
        ? value
          ? "1"
          : "0"
        : value === null
          ? ""
          : String(value);
  }
  return out;
}

export function decodeMember(hash: Record<string, string>): MemberRecord {
  const record = {
    login: hash.login,
    displayLogin: hash.displayLogin || hash.login,
    nickname: hash.nickname,
    whatsapp: hash.whatsapp,
    avatarUrl: hash.avatarUrl,
    name: hash.name || null,
    hidden: hash.hidden === "1",
    projects: hash.projects ? JSON.parse(hash.projects) : [],
    starredRepositories: hash.starredRepositories ? JSON.parse(hash.starredRepositories) : undefined,
    helperPeriods: hash.helperPeriods ? JSON.parse(hash.helperPeriods) : undefined,
    spotlightRepositoryId: hash.spotlightRepositoryId || undefined,
  } as MemberRecord;
  for (const key of NUMERIC) record[key] = Number(hash[key]) || 0;
  return record;
}
