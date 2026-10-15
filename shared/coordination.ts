export interface CoordinationPolicy {
  enabled: boolean;
  timezone: string;
  welcomeTimes: string[];
  quietStart: number;
  quietEnd: number;
  graceDays: number;
  target: number;
  reviewPeers: number;
  periodDays: number;
  reminderDays: number;
  warningDays: number;
  removalDays: number;
}

export interface ActivitySummary {
  linked: boolean;
  login: string | null;
  enabled: boolean;
  tracking: boolean;
  contributions: number;
  reviewPeers: number;
  target: number;
  requiredReviewPeers: number;
  inactiveDays: number;
  graceRemainingDays: number;
  awayUntil: number | null;
  awayRequestedDays: number | null;
  pendingContributions: number;
  removalReview: boolean;
}

export interface CoordinationProject {
  id: string;
  owner: string;
  title: string;
  url: string;
  createdAt: number;
  status: "pending" | "approved" | "closed";
  reviews: number;
  assignedTo: string[];
}

export interface CoordinationHelp {
  id: string;
  owner: string;
  question: string;
  createdAt: number;
  status: "open" | "resolved";
}

export interface CoordinationContribution {
  id: string;
  by: string;
  for: string;
  kind: "review" | "answer";
  targetId: string;
  text: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface ParticipationState {
  activity: ActivitySummary;
  projects: CoordinationProject[];
  help: CoordinationHelp[];
  contributions: CoordinationContribution[];
}

export interface LinkChallenge {
  id: string;
  code: string;
  expiresAt: number;
}

export type ParticipationAction =
  | { action: "project"; title: string; url: string }
  | { action: "review"; projectId: string; text: string }
  | { action: "help"; question: string }
  | { action: "answer"; helpId: string; text: string }
  | { action: "confirm"; id: string; approve: boolean }
  | { action: "away"; days: number }
  | { action: "close"; id: string };

export interface CoordinationAdminState {
  policy: CoordinationPolicy;
  tracking: boolean;
  botAdmin: boolean;
  announced: boolean;
  members: (ActivitySummary & { id: string; name: string; contact: string; active: boolean; welcomePending: boolean; warnings: number[] })[];
  projects: CoordinationProject[];
  help: CoordinationHelp[];
  contributions: CoordinationContribution[];
  cases: { id: string; memberId: string; member: string; reason: string; kind: "inactive" | "low" | "spam"; status: string; eligible: boolean; blockedReason: string | null }[];
  outbox: { id: string; status: string; kind: string; recipient: string; text: string; createdAt: number; error: string | null }[];
  audit: { at: number; action: string; detail: string }[];
}
