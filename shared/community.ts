export const TOOL_CATEGORIES = ["Development", "Design", "Productivity", "Learning"] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export interface CommunityTool {
  id: string;
  name: string;
  url: string;
  description: string;
  category: ToolCategory;
  source: "curated" | "community";
  status: "pending" | "approved";
  sourceUrl?: string;
  createdAt: number;
}

export interface ToolInput {
  name: string;
  url: string;
  description: string;
  category: ToolCategory;
}

export interface CommunityState {
  tools: CommunityTool[];
  counts: Record<string, number>;
  voted: string[];
  toolVotes?: Record<string, VoteValue>;
  profile?: GitHubProfile | null;
  signInAvailable?: boolean;
}

export type VoteValue = -1 | 0 | 1;

export interface GitHubProfile {
  id: number;
  login: string;
  name?: string | null;
  avatarUrl: string;
  starsConnected?: boolean;
}

export interface ToolVoteInput {
  target: string;
  value: VoteValue;
}

export interface ToolVoteResult extends ToolVoteInput {
  count: number;
}

export interface VoteInput {
  target: string;
  active: boolean;
}

export interface VoteResult extends VoteInput {
  count: number;
}
