import { Redis } from "@upstash/redis";
import type { CommunityTool, GitHubProfile, ToolVoteResult, VoteResult, VoteValue } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import type { CommunityStore } from "./community-contract.js";
import { HttpError } from "./http.js";

const P = "oc:community:";
const keys = {
  tools: `${P}tools`,
  urls: `${P}urls`,
  counts: `${P}counts`,
  actor: (actor: string) => `${P}actor:${actor}`,
  voters: (target: string) => `${P}voters:${target}`,
  profileCounts: `${P}profile-counts`,
  profileActor: (actor: string) => `${P}profile-actor:${actor}`,
  profileVoters: (target: string) => `${P}profile-voters:${target}`,
  session: (hash: string) => `${P}session:${hash}`,
};

const READ_VOTES = `
return {redis.call('HGETALL', KEYS[1]), redis.call('SMEMBERS', KEYS[2])}`;

const SET_VOTE = `
if ARGV[4] ~= '' and ARGV[5] ~= '1' then
  local raw = redis.call('HGET', KEYS[4], ARGV[4])
  if not raw or cjson.decode(raw).status ~= 'approved' then return -1 end
end
if ARGV[3] == '1' then
  redis.call('SADD', KEYS[1], ARGV[2])
  redis.call('SADD', KEYS[2], ARGV[1])
else
  redis.call('SREM', KEYS[1], ARGV[2])
  redis.call('SREM', KEYS[2], ARGV[1])
end
local count = redis.call('SCARD', KEYS[1])
if count > 0 then redis.call('HSET', KEYS[3], ARGV[1], count)
else redis.call('HDEL', KEYS[3], ARGV[1]) end
return count`;

const CREATE_TOOL = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 or redis.call('HEXISTS', KEYS[2], ARGV[2]) == 1 then
  return 0
end
if redis.call('HLEN', KEYS[1]) >= 1000 then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[1])
return 1`;

const SET_PROFILE_VOTE = `
if ARGV[5] ~= '1' then
  local raw = redis.call('HGET', KEYS[4], ARGV[4])
  if not raw or cjson.decode(raw).status ~= 'approved' then return {0, 0} end
end
local previous = tonumber(redis.call('HGET', KEYS[1], ARGV[2]) or '0')
local value = tonumber(ARGV[3])
if value == 0 then
  redis.call('HDEL', KEYS[1], ARGV[2])
  redis.call('HDEL', KEYS[2], ARGV[1])
else
  redis.call('HSET', KEYS[1], ARGV[2], value)
  redis.call('HSET', KEYS[2], ARGV[1], value)
end
local count = redis.call('HINCRBY', KEYS[3], ARGV[1], value - previous)
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('HDEL', KEYS[3], ARGV[1]) end
return {1, count}`;

const APPROVE_TOOL = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local tool = cjson.decode(raw)
tool.status = 'approved'
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(tool))
return 1`;

const REMOVE_TOOL = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local tool = cjson.decode(raw)
for _, actor in ipairs(redis.call('SMEMBERS', KEYS[3])) do
  redis.call('SREM', ARGV[3] .. actor, ARGV[2])
end
for _, actor in ipairs(redis.call('HKEYS', KEYS[5])) do
  redis.call('HDEL', ARGV[4] .. actor, ARGV[2])
end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], tool.url)
redis.call('DEL', KEYS[3])
redis.call('HDEL', KEYS[4], ARGV[2])
redis.call('DEL', KEYS[5])
redis.call('HDEL', KEYS[6], ARGV[2])
return 1`;

export class RedisCommunityStore implements CommunityStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async listTools(): Promise<CommunityTool[]> {
    const records = (await this.redis.hvals(keys.tools)) as string[];
    return records.map((record) => JSON.parse(record) as CommunityTool);
  }

  async readVotes(actor: string) {
    const [fields, voted] = (await this.redis.eval(
      READ_VOTES,
      [keys.counts, keys.actor(actor)],
      [],
    )) as [string[], string[]];
    const counts: Record<string, number> = {};
    for (let index = 0; index < fields.length; index += 2) {
      counts[fields[index]] = Number(fields[index + 1]);
    }
    return { counts, voted };
  }

  async setVote(target: string, actor: string, active: boolean): Promise<VoteResult> {
    const toolId = target.startsWith("tool:") ? target.slice(5) : "";
    const curated = CURATED_TOOLS.some((tool) => tool.id === toolId);
    const count = Number(await this.redis.eval(
      SET_VOTE,
      [keys.voters(target), keys.actor(actor), keys.counts, keys.tools],
      [target, actor, active ? "1" : "0", toolId, curated ? "1" : "0"],
    ));
    if (count < 0) throw new HttpError(404, "not_found", "That tool is no longer available.");
    return { target, active, count };
  }

  async createTool(tool: CommunityTool): Promise<boolean> {
    if (CURATED_TOOLS.some((existing) => existing.id === tool.id || existing.url === tool.url)) return false;
    const result = Number(await this.redis.eval(
      CREATE_TOOL,
      [keys.tools, keys.urls],
      [tool.id, tool.url, JSON.stringify(tool)],
    ));
    if (result < 0) throw new HttpError(409, "tools_full", "The tools directory is full.");
    return result === 1;
  }

  async removeTool(id: string): Promise<void> {
    const target = `tool:${id}`;
    await this.redis.eval(
      REMOVE_TOOL,
      [keys.tools, keys.urls, keys.voters(target), keys.counts, keys.profileVoters(target), keys.profileCounts],
      [id, target, `${P}actor:`, `${P}profile-actor:`],
    );
  }

  async approveTool(id: string): Promise<boolean> {
    return Number(await this.redis.eval(APPROVE_TOOL, [keys.tools], [id])) === 1;
  }

  async readProfileVotes(actor: string | null) {
    const [fields, own] = await this.redis.eval("return {redis.call('HGETALL', KEYS[1]), redis.call('HGETALL', KEYS[2])}", [keys.profileCounts, keys.profileActor(actor ?? "")], []) as [string[], string[]];
    const counts: Record<string, number> = {};
    const votes: Record<string, VoteValue> = {};
    for (let i = 0; i < fields.length; i += 2) counts[fields[i]] = Number(fields[i + 1]);
    for (let i = 0; i < own.length; i += 2) votes[own[i]] = Number(own[i + 1]) as VoteValue;
    return { counts, votes };
  }

  async setProfileVote(target: string, actor: string, value: VoteValue): Promise<ToolVoteResult> {
    const id = target.slice(5);
    const [accepted, count] = await this.redis.eval(SET_PROFILE_VOTE, [keys.profileVoters(target), keys.profileActor(actor), keys.profileCounts, keys.tools], [target, actor, value, id, CURATED_TOOLS.some((tool) => tool.id === id) ? "1" : "0"]) as [number, number];
    if (!accepted) throw new HttpError(404, "not_found", "That tool is no longer available.");
    return { target, value, count: Number(count) };
  }

  async createSession(hash: string, profile: GitHubProfile, expiresAt: number): Promise<void> {
    await this.redis.set(keys.session(hash), JSON.stringify(profile), { px: Math.max(1, expiresAt - Date.now()) });
  }

  async readSession(hash: string): Promise<GitHubProfile | null> {
    const raw = await this.redis.get<string>(keys.session(hash));
    return raw ? JSON.parse(raw) as GitHubProfile : null;
  }

  async removeSession(hash: string): Promise<void> {
    await this.redis.del(keys.session(hash));
  }
}
