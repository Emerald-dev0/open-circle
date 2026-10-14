export interface Weights {
  stars: number;
  followers: number;
  repos: number;
  /** Repos past this count earn nothing, so 200 empty repos can't farm points. */
  reposCap: number;
  activity: number;
  /** Contributions past this count earn nothing. */
  activityCap: number;
}

export interface GithubStats {
  /** GitHub's own casing. Compare lowercased. */
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Stars across owned, non-fork public repos. */
  stars: number;
  followers: number;
  /** Owned, non-fork public repos. */
  repos: number;
  /** Public contributions (commits, PRs, reviews, issues, new repos) in the last 30 days. */
  activity: number;
}

/** A member as the public board sees them. Never carries the WhatsApp number. */
export interface PublicMember {
  login: string;
  nickname: string;
  avatarUrl: string;
  score: number;
  stars: number;
  followers: number;
  repos: number;
  activity: number;
  rank: number;
  /** Places gained (+) or lost (−) on the last move, if it happened in the last 24h. */
  delta: number;
  /** Joined in the last 24h. */
  isNew: boolean;
}

export interface InviteConfig {
  url: string;
  /** False when the link is full or stale; the CTA then shows `note` instead. */
  open: boolean;
  note: string;
}

export interface Board {
  members: PublicMember[];
  /** When this snapshot was written. Clients never replace a newer one with an older one. */
  updatedAt: number;
  /** When GitHub stats were last pulled. */
  refreshedAt: number;
  /** The last GitHub pull failed; the board is showing older numbers. */
  statsDelayed: boolean;
  invite: InviteConfig;
  weights: Weights;
}

export interface Preview {
  profile: GithubStats;
  score: number;
}

export interface RegisterInput {
  nickname: string;
  github: string;
  whatsapp: string;
}

export interface RegisterResult {
  login: string;
  board: Board;
}

export interface AdminMember extends PublicMember {
  whatsapp: string;
  hidden: boolean;
  createdAt: number;
  statsUpdatedAt: number;
}

export interface AdminConfig {
  invite: InviteConfig;
  weights: Weights;
}

export interface AdminState {
  members: AdminMember[];
  config: AdminConfig;
}

export type AdminAction =
  | { action: "hide" | "unhide" | "remove"; login: string }
  | { action: "config"; config: AdminConfig };

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string };
}
