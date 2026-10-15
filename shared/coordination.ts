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
  feedbackWanted?: string;
  skills?: string[];
}

export interface CoordinationHelp {
  id: string;
  owner: string;
  question: string;
  createdAt: number;
  status: "open" | "resolved";
  skills?: string[];
  assignedTo?: string[];
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
  community?: MemberCommunityState;
}

export interface LinkChallenge {
  id: string;
  code: string;
  expiresAt: number;
  botChatUrl?: string;
}

export type ParticipationAction =
  | { action: "project"; title: string; url: string; feedbackWanted?: string; skills?: string[] }
  | { action: "review"; projectId: string; text: string }
  | { action: "help"; question: string; skills?: string[] }
  | { action: "answer"; helpId: string; text: string }
  | { action: "confirm"; id: string; approve: boolean }
  | { action: "away"; days: number }
  | { action: "close"; id: string }
  | { action: "mentor"; available: boolean; skills: string[]; weeklyLimit: number }
  | { action: "decline-help"; id: string };

export interface CommunitySettings {
  groupSchedule: boolean;
  summariesEnabled: boolean;
  mentorMatching: boolean;
  sessionsEnabled: boolean;
  summaryTime: string;
  announcementsJid: string;
  mentorWaitHours: number;
  helpDay: number;
  helpTime: string;
  demoDay: number;
  demoTime: string;
  sessionMinutes: number;
}

export interface CommunityUpdate {
  id: string;
  date: string;
  title: string;
  text: string;
  createdAt: number;
  groupSentAt: number | null;
}

export interface CommunitySession {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
}

export interface MentorPreferences {
  available: boolean;
  skills: string[];
  weeklyLimit: number;
}

export interface MemberCommunityState {
  timezone: string;
  quietStart: number;
  quietEnd: number;
  groupSchedule: boolean;
  updates: CommunityUpdate[];
  sessions: CommunitySession[];
  mentor: MentorPreferences;
  assignedHelp: string[];
}

export function isMemberCommunityState(value: unknown): value is MemberCommunityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as MemberCommunityState;
  const timestamp = (input: unknown) => typeof input === "number" && Number.isFinite(input) && Math.abs(input) <= 8.64e15;
  if (typeof state.timezone !== "string" || typeof state.groupSchedule !== "boolean" || ![state.quietStart, state.quietEnd].every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: state.timezone }); } catch { return false; }
  if (!Array.isArray(state.updates) || state.updates.length > 60 || !state.updates.every((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.text === "string" && typeof entry.date === "string" && timestamp(entry.createdAt) && (entry.groupSentAt === null || timestamp(entry.groupSentAt)))) return false;
  if (!Array.isArray(state.sessions) || state.sessions.length > 4 || !state.sessions.every((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.title === "string" && timestamp(entry.startsAt) && timestamp(entry.endsAt) && entry.endsAt > entry.startsAt)) return false;
  if (!state.mentor || typeof state.mentor !== "object" || typeof state.mentor.available !== "boolean" || !Number.isInteger(state.mentor.weeklyLimit) || state.mentor.weeklyLimit < 1 || state.mentor.weeklyLimit > 5 || !Array.isArray(state.mentor.skills) || state.mentor.skills.length > 8 || !state.mentor.skills.every((skill) => typeof skill === "string" && skill.length <= 30)) return false;
  return Array.isArray(state.assignedHelp) && state.assignedHelp.every((entry) => typeof entry === "string");
}

export interface CommunityAdminState {
  settings: CommunitySettings;
  groupControl: { overrideOpen: boolean | null; overrideUntil: number | null; status: "idle" | "pending" | "uncertain"; error: string | null; observedOpen: boolean | null };
  updates: CommunityUpdate[];
  sessions: CommunitySession[];
  mentors: { login: string; skills: string[]; weeklyLimit: number; available: boolean }[];
  metrics: { newLinkedMembers: number; firstContributors: number; confirmedContributions: number; openQuestions: number; resolvedQuestions: number; projectsWithFeedback: number };
}

export interface CoordinationAdminState {
  community?: CommunityAdminState;
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
