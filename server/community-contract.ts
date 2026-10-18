import type { CommunityTool, GitHubProfile, ToolVoteResult, VoteResult, VoteValue } from "../shared/community.js";

export interface GitHubSession extends GitHubProfile {
  starAuthorization?: string;
}

export interface CommunityStore {
  listTools(): Promise<CommunityTool[]>;
  listToolCatalog(): Promise<CommunityTool[]>;
  readVotes(actor: string): Promise<{ counts: Record<string, number>; voted: string[] }>;
  setVote(target: string, actor: string, active: boolean): Promise<VoteResult>;
  readProfileVotes(actor: string | null): Promise<{ counts: Record<string, number>; votes: Record<string, VoteValue> }>;
  setProfileVote(target: string, actor: string, value: VoteValue): Promise<ToolVoteResult>;
  createSession(hash: string, profile: GitHubSession, expiresAt: number): Promise<void>;
  readSession(hash: string): Promise<GitHubSession | null>;
  removeSession(hash: string): Promise<void>;
  createTool(tool: CommunityTool): Promise<boolean>;
  approveTool(id: string): Promise<boolean>;
  removeTool(id: string): Promise<void>;
}
