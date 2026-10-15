import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { CommunityState, CommunityTool, GitHubProfile, ToolVoteResult, VoteResult, VoteValue } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import { parseToolInput } from "../shared/tool-validation.js";
import { readBoard, rebuildBoard } from "./board.js";
import type { CommunityStore } from "./community-contract.js";
import { HttpError, requireSameOrigin } from "./http.js";
import { clientKey } from "./rate-limit.js";
import type { Store } from "./store.js";

const COOKIE = "opencircle_visitor";

export function visitor(req: Request, requireExisting = false): { actor: string; headers: Record<string, string> } {
  const saved = req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (requireExisting && (!saved || !/^[a-f0-9]{64}$/.test(saved)))
    throw new HttpError(409, "visitor_missing", "Enable cookies and reload the page to vote or share tools.");
  const token = saved && /^[a-f0-9]{64}$/.test(saved) ? saved : randomBytes(32).toString("hex");
  return {
    actor: createHash("sha256").update(token).digest("hex"),
    headers: {
      "cache-control": "private, no-store",
      "vary": "Cookie",
      ...(saved === token ? {} : {
        "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
      }),
    },
  };
}

export function requireSameOriginJson(req: Request): void {
  requireSameOrigin(req);
  if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new HttpError(415, "json_required", "Send this request as JSON.");
}

export async function communityRateLimit(req: Request, store: Store, actor: string, action: "vote" | "tool") {
  const seconds = action === "vote" ? 60 : 3600;
  const limit = action === "vote" ? 60 : 5;
  const allowed = await Promise.all([
    store.rateLimit(`community:${action}:ip:${clientKey(req)}`, limit, seconds),
    store.rateLimit(`community:${action}:visitor:${actor}`, limit, seconds),
  ]);
  if (allowed.some((value) => !value))
    throw new HttpError(429, "rate_limited", action === "vote" ? "You're voting quickly. Wait a minute and try again." : "You've shared several tools. Try again in an hour.", undefined, { "retry-after": String(seconds) });
}

export async function readCommunity(store: CommunityStore, actor: string, profile: GitHubProfile | null = null, signInAvailable = false, profileKey: string | null = null): Promise<CommunityState> {
  const [tools, votes, profileVotes] = await Promise.all([store.listToolCatalog(), store.readVotes(actor), signInAvailable ? store.readProfileVotes(profileKey) : Promise.resolve({ counts: {} as Record<string, number>, votes: {} as Record<string, VoteValue> })]);
  const visibleTools = tools.filter((tool) => tool.status === "approved");
  const visibleTargets = new Set(visibleTools.map((tool) => `tool:${tool.id}`));
  return {
    tools: visibleTools,
    counts: Object.fromEntries([...Object.entries(votes.counts).filter(([target]) => target.startsWith("repo:")), ...Object.entries(profileVotes.counts).filter(([target]) => visibleTargets.has(target))]),
    voted: votes.voted.filter((target) => target.startsWith("repo:")),
    toolVotes: Object.fromEntries(Object.entries(profileVotes.votes).filter(([target]) => visibleTargets.has(target))),
    profile,
    signInAvailable,
  };
}

export async function profileVote(store: CommunityStore, actor: string, input: unknown): Promise<ToolVoteResult> {
  const body = input as { target?: unknown; value?: unknown } | null;
  if (typeof body?.target !== "string" || body.target.length > 256 || !/^tool:[^:]+$/.test(body.target) || ![-1, 0, 1].includes(Number(body.value)) || typeof body.value !== "number")
    throw new HttpError(400, "invalid_vote", "Choose an upvote or downvote for a tool.");
  const id = body.target.slice(5);
  const exists = (await store.listToolCatalog()).some((tool) => tool.id === id && tool.status === "approved");
  if (!exists) throw new HttpError(404, "not_found", "That tool is no longer listed.");
  return store.setProfileVote(body.target, actor, body.value as VoteValue);
}

export async function vote(store: CommunityStore, boardStore: Store, actor: string, input: unknown): Promise<VoteResult> {
  const body = input as { target?: unknown; active?: unknown } | null;
  if (typeof body?.target !== "string" || body.target.length > 256 || typeof body.active !== "boolean")
    throw new HttpError(400, "invalid_vote", "Choose a repository or tool to upvote.");
  const { target, active } = body;
  const [kind, ...parts] = target.split(":");
  const id = parts.join(":");
  if (!id || !["repo", "tool"].includes(kind))
    throw new HttpError(400, "invalid_vote", "Choose a repository or tool to upvote.");
  const exists = kind === "repo"
    ? (await readBoard(boardStore)).repositories.some((repo) => repo.id === id)
    : (await store.listToolCatalog()).some((tool) => tool.id === id && tool.status === "approved");
  if (!exists) throw new HttpError(404, "not_found", "That project or tool is no longer listed.");
  const result = await store.setVote(target, actor, active);
  if (kind === "repo") {
    const { counts } = await store.readVotes("");
    await rebuildBoard(boardStore, { voteCounts: counts });
  }
  return result;
}

export async function submitTool(store: CommunityStore, input: unknown, status: CommunityTool["status"] = "pending"): Promise<CommunityTool> {
  const parsed = parseToolInput(input);
  if (!parsed.ok) throw new HttpError(400, "invalid_tool", parsed.error, parsed.field);
  const curated = CURATED_TOOLS.find((tool) => tool.url === parsed.value.url);
  const tool: CommunityTool = { ...parsed.value, id: curated?.id ?? randomUUID(), source: "community", status, createdAt: Date.now() };
  if (!await store.createTool(tool))
    throw new HttpError(409, "tool_exists", "That tool is already in the directory.", "url");
  return tool;
}
