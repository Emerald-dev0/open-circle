import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CommunityTool, ToolVoteResult, VoteResult, VoteValue } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import type { CommunityStore, GitHubSession } from "./community-contract.js";
import { HttpError } from "./http.js";
import { toolCatalog, type StoredTool } from "./tool-catalog.js";

interface Snapshot {
  tools: StoredTool[];
  votes: [string, string[]][];
  profileVotes?: [string, [string, VoteValue][]][];
  sessions?: [string, { profile: GitHubSession; expiresAt: number }][];
}

interface LocalState {
  tools: Map<string, StoredTool>;
  votes: Map<string, Set<string>>;
  profileVotes: Map<string, Map<string, VoteValue>>;
  sessions: Map<string, { profile: GitHubSession; expiresAt: number }>;
}

const FILE = path.resolve(process.cwd(), ".data/community-store.json");
const globalStore = globalThis as typeof globalThis & {
  __openCircleCommunityStores?: Map<string, LocalState>;
};

function load(file: string | null): LocalState {
  if (file && existsSync(file)) {
    const snapshot = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
    if (!Array.isArray(snapshot.tools) || !Array.isArray(snapshot.votes)) {
      throw new Error("The local community store is invalid.");
    }
    return {
      tools: new Map(snapshot.tools.map((tool) => [tool.id, tool])),
      votes: new Map(snapshot.votes.map(([target, actors]) => [target, new Set(actors)])),
      profileVotes: new Map((snapshot.profileVotes ?? []).map(([target, votes]) => [target, new Map(votes)])),
      sessions: new Map(snapshot.sessions ?? []),
    };
  }
  return { tools: new Map(), votes: new Map(), profileVotes: new Map(), sessions: new Map() };
}

export class MemoryCommunityStore implements CommunityStore {
  private readonly file: string | null;
  private readonly data: LocalState;

  constructor(file: string | null = FILE) {
    this.file = file === null ? null : path.resolve(file);
    if (this.file === null) {
      this.data = load(null);
    } else {
      const stores = (globalStore.__openCircleCommunityStores ??= new Map());
      const data = stores.get(this.file) ?? load(this.file);
      data.profileVotes ??= new Map();
      data.sessions ??= new Map();
      stores.set(this.file, data);
      this.data = data;
    }
  }

  private save(changes: Partial<LocalState>): void {
    const next = { ...this.data, ...changes };
    if (this.file !== null) {
      const snapshot: Snapshot = {
        tools: [...next.tools.values()],
        votes: [...next.votes].map(([target, actors]) => [target, [...actors]]),
        profileVotes: [...next.profileVotes].map(([target, votes]) => [target, [...votes]]),
        sessions: [...next.sessions],
      };
      mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
        renameSync(temporary, this.file);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
    this.data.tools = next.tools;
    this.data.votes = next.votes;
    this.data.profileVotes = next.profileVotes;
    this.data.sessions = next.sessions;
  }

  async listTools(): Promise<CommunityTool[]> {
    return [...this.data.tools.values()].filter((tool) => !tool.removed).map((tool) => ({ ...tool }));
  }

  async listToolCatalog(): Promise<CommunityTool[]> {
    return toolCatalog([...this.data.tools.values()]);
  }

  private availableTool(id: string): boolean {
    const tool: StoredTool | undefined = this.data.tools.get(id) ?? CURATED_TOOLS.find((tool) => tool.id === id);
    return tool?.status === "approved" && !tool.removed;
  }

  async readVotes(actor: string) {
    const counts: Record<string, number> = {};
    const voted: string[] = [];
    for (const [target, actors] of this.data.votes) {
      if (actors.size > 0) counts[target] = actors.size;
      if (actors.has(actor)) voted.push(target);
    }
    return { counts, voted };
  }

  async setVote(target: string, actor: string, active: boolean): Promise<VoteResult> {
    if (
      target.startsWith("tool:") &&
      !this.availableTool(target.slice(5))
    ) {
      throw new HttpError(404, "not_found", "That tool is no longer available.");
    }
    const actors = new Set(this.data.votes.get(target));
    if (active) actors.add(actor);
    else actors.delete(actor);
    const votes = new Map(this.data.votes);
    if (actors.size > 0) votes.set(target, actors);
    else votes.delete(target);
    this.save({ tools: this.data.tools, votes });
    return { target, active, count: actors.size };
  }

  async createTool(tool: CommunityTool): Promise<boolean> {
    const removed = this.data.tools.get(tool.id)?.removed;
    const curated = CURATED_TOOLS.find((existing) => existing.id === tool.id || existing.url === tool.url);
    if (curated && (!removed || curated.id !== tool.id || curated.url !== tool.url)) return false;
    if (
      [...this.data.tools.values()].some(
        (existing) => !existing.removed && (existing.id === tool.id || existing.url === tool.url),
      )
    ) return false;
    if ([...this.data.tools.values()].filter((tool) => !tool.removed).length >= 1_000) {
      throw new HttpError(409, "tools_full", "The tools directory is full.");
    }
    const tools = new Map(this.data.tools);
    tools.set(tool.id, { ...tool });
    this.save({ tools, votes: this.data.votes });
    return true;
  }

  async removeTool(id: string): Promise<void> {
    const curated = CURATED_TOOLS.find((tool) => tool.id === id);
    if (!this.data.tools.has(id) && !curated) return;
    const tools = new Map(this.data.tools);
    const votes = new Map(this.data.votes);
    const profileVotes = new Map(this.data.profileVotes);
    tools.delete(id);
    if (curated) tools.set(id, { ...curated, removed: true });
    votes.delete(`tool:${id}`);
    profileVotes.delete(`tool:${id}`);
    this.save({ tools, votes, profileVotes });
  }

  async approveTool(id: string): Promise<boolean> {
    const tool = this.data.tools.get(id);
    if (!tool || tool.removed) return false;
    const tools = new Map(this.data.tools);
    tools.set(id, { ...tool, status: "approved" });
    this.save({ tools, votes: this.data.votes });
    return true;
  }

  async readProfileVotes(actor: string | null) {
    const counts: Record<string, number> = {};
    const votes: Record<string, VoteValue> = {};
    for (const [target, voters] of this.data.profileVotes) {
      counts[target] = [...voters.values()].reduce<number>((sum, value) => sum + value, 0);
      if (actor && voters.has(actor)) votes[target] = voters.get(actor)!;
    }
    return { counts, votes };
  }

  async setProfileVote(target: string, actor: string, value: VoteValue): Promise<ToolVoteResult> {
    if (!this.availableTool(target.slice(5)))
      throw new HttpError(404, "not_found", "That tool is no longer available.");
    const voters = new Map(this.data.profileVotes.get(target));
    if (value === 0) voters.delete(actor);
    else voters.set(actor, value);
    const profileVotes = new Map(this.data.profileVotes);
    if (voters.size) profileVotes.set(target, voters);
    else profileVotes.delete(target);
    this.save({ profileVotes });
    return { target, value, count: [...voters.values()].reduce<number>((sum, current) => sum + current, 0) };
  }

  async createSession(hash: string, profile: GitHubSession, expiresAt: number): Promise<void> {
    const sessions = new Map([...this.data.sessions].filter(([, session]) => session.expiresAt > Date.now()));
    sessions.set(hash, { profile: { ...profile }, expiresAt });
    this.save({ sessions });
  }

  async readSession(hash: string): Promise<GitHubSession | null> {
    const session = this.data.sessions.get(hash);
    return session && session.expiresAt > Date.now() ? { ...session.profile } : null;
  }

  async removeSession(hash: string): Promise<void> {
    const sessions = new Map(this.data.sessions);
    sessions.delete(hash);
    this.save({ sessions });
  }
}
