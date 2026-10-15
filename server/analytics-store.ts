import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { Redis } from "@upstash/redis";
import type { AnalyticsPage, TrafficPeriod } from "../shared/analytics.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";

export const DAY = 86_400_000;
export const RETENTION_DAYS = 180;
export const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10);
export const dayStart = (time: number) => Math.floor(time / DAY) * DAY;

export interface Visit {
  actor: string;
  page: AnalyticsPage;
  source: string;
  at: number;
}

export interface AnalyticsStore {
  record(visit: Visit): Promise<void>;
  read(start: number, end: number): Promise<TrafficPeriod>;
  startedAt(): Promise<number | null>;
}

export function emptyTraffic(): TrafficPeriod {
  return { visitors: 0, pageViews: 0, returningVisitors: 0, daily: [], pages: [], sources: [] };
}

export function rankedCounts(counts: Record<string, number>) {
  return Object.entries(counts).map(([name, views]) => ({ name, views })).sort((a, b) => b.views - a.views || a.name.localeCompare(b.name)).slice(0, 5);
}

interface MemoryDay {
  actors: Record<string, number>;
  pages: Record<string, number>;
  sources: Record<string, number>;
}

interface Snapshot {
  startedAt: number | null;
  days: Record<string, MemoryDay>;
}

const globalStore = globalThis as typeof globalThis & { __openCircleAnalytics?: Map<string, Snapshot> };

export class MemoryAnalyticsStore implements AnalyticsStore {
  private readonly data: Snapshot;

  constructor(private readonly file: string | null = path.resolve(".data/analytics-store.json")) {
    const stores = globalStore.__openCircleAnalytics ??= new Map();
    this.data = (file && stores.get(file)) || (file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as Snapshot : { startedAt: null, days: {} });
    if (file) stores.set(file, this.data);
  }

  async record(visit: Visit) {
    const next: Snapshot = structuredClone(this.data);
    next.startedAt ??= visit.at;
    const day = next.days[dateKey(visit.at)] ??= { actors: {}, pages: {}, sources: {} };
    day.actors[visit.actor] = (day.actors[visit.actor] ?? 0) + 1;
    day.pages[visit.page] = (day.pages[visit.page] ?? 0) + 1;
    day.sources[visit.source] = (Object.hasOwn(day.sources, visit.source) ? day.sources[visit.source] : 0) + 1;
    const cutoff = dateKey(dayStart(visit.at) - (RETENTION_DAYS - 1) * DAY);
    for (const date of Object.keys(next.days)) if (date < cutoff) delete next.days[date];
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
        renameSync(temporary, this.file);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
    Object.assign(this.data, next);
  }

  async startedAt() { return this.data.startedAt; }

  async read(start: number, end: number) {
    const result = emptyTraffic();
    const actors = new Map<string, number>();
    const pages: Record<string, number> = Object.create(null);
    const sources: Record<string, number> = Object.create(null);
    for (let at = start; at < end; at += DAY) {
      const date = dateKey(at);
      const day = this.data.days[date];
      if (!day) continue;
      const pageViews = Object.values(day.actors).reduce((sum, count) => sum + count, 0);
      result.daily.push({ date, visitors: Object.keys(day.actors).length, pageViews });
      result.pageViews += pageViews;
      for (const actor of Object.keys(day.actors)) actors.set(actor, (actors.get(actor) ?? 0) + 1);
      for (const [name, count] of Object.entries(day.pages)) pages[name] = (pages[name] ?? 0) + count;
      for (const [name, count] of Object.entries(day.sources)) sources[name] = (sources[name] ?? 0) + count;
    }
    result.visitors = actors.size;
    result.returningVisitors = [...actors.values()].filter((days) => days > 1).length;
    result.pages = rankedCounts(pages);
    result.sources = rankedCounts(sources);
    return result;
  }
}

export class PostgresAnalyticsStore implements AnalyticsStore {
  constructor(private readonly pool: Pool) {}

  async record(visit: Visit) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO opencircle_analytics_meta (id, started_at) VALUES (true, $1) ON CONFLICT DO NOTHING", [visit.at]);
      await client.query(`INSERT INTO opencircle_analytics_visitors (day, actor, views) VALUES ($1, $2, 1)
        ON CONFLICT (day, actor) DO UPDATE SET views = opencircle_analytics_visitors.views + 1`, [dateKey(visit.at), visit.actor]);
      await client.query(`INSERT INTO opencircle_analytics_counts (day, kind, name, views) VALUES ($1, 'page', $2, 1), ($1, 'source', $3, 1)
        ON CONFLICT (day, kind, name) DO UPDATE SET views = opencircle_analytics_counts.views + 1`, [dateKey(visit.at), visit.page, visit.source]);
      const cutoff = dateKey(dayStart(visit.at) - (RETENTION_DAYS - 1) * DAY);
      await client.query("DELETE FROM opencircle_analytics_visitors WHERE day < $1", [cutoff]);
      await client.query("DELETE FROM opencircle_analytics_counts WHERE day < $1", [cutoff]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async startedAt() {
    const { rows } = await this.pool.query<{ started_at: string }>("SELECT started_at FROM opencircle_analytics_meta WHERE id = true");
    return rows[0] ? Number(rows[0].started_at) : null;
  }

  async read(start: number, end: number): Promise<TrafficPeriod> {
    const params = [dateKey(start), dateKey(end)];
    const [totals, daily, counts] = await Promise.all([
      this.pool.query<{ visitors: string; page_views: string; returning: string }>(`SELECT COUNT(*) AS visitors, COALESCE(SUM(views), 0) AS page_views,
        COUNT(*) FILTER (WHERE days > 1) AS returning FROM (
          SELECT actor, SUM(views) AS views, COUNT(*) AS days FROM opencircle_analytics_visitors
          WHERE day >= $1 AND day < $2 GROUP BY actor
        ) visitors`, params),
      this.pool.query<{ date: string; visitors: string; page_views: string }>(`SELECT day::text AS date, COUNT(*) AS visitors, SUM(views) AS page_views
        FROM opencircle_analytics_visitors WHERE day >= $1 AND day < $2 GROUP BY day ORDER BY day`, params),
      this.pool.query<{ kind: string; name: string; views: string }>(`SELECT kind, name, SUM(views) AS views FROM opencircle_analytics_counts
        WHERE day >= $1 AND day < $2 GROUP BY kind, name`, params),
    ]);
    const row = totals.rows[0];
    return {
      visitors: Number(row.visitors), pageViews: Number(row.page_views), returningVisitors: Number(row.returning),
      daily: daily.rows.map((day) => ({ date: day.date, visitors: Number(day.visitors), pageViews: Number(day.page_views) })),
      pages: rankedCounts(Object.fromEntries(counts.rows.filter((item) => item.kind === "page").map((item) => [item.name, Number(item.views)]))),
      sources: rankedCounts(Object.fromEntries(counts.rows.filter((item) => item.kind === "source").map((item) => [item.name, Number(item.views)]))),
    };
  }
}

const PREFIX = "oc:analytics:";
const RECORD = `
redis.call('SET', KEYS[1], ARGV[1], 'NX')
redis.call('SADD', KEYS[2], ARGV[2])
redis.call('HINCRBY', KEYS[3], 'page:' .. ARGV[3], 1)
redis.call('HINCRBY', KEYS[3], 'source:' .. ARGV[4], 1)
redis.call('EXPIREAT', KEYS[2], ARGV[5])
redis.call('EXPIREAT', KEYS[3], ARGV[5])
return 1`;

const READ = `
local actors = {}
local daily = {}
local pages = {}
local sources = {}
local views = 0
for i = 1, #KEYS, 2 do
  local visitors = redis.call('SMEMBERS', KEYS[i])
  for _, actor in ipairs(visitors) do actors[actor] = (actors[actor] or 0) + 1 end
  local fields = redis.call('HGETALL', KEYS[i + 1])
  local dayViews = 0
  for j = 1, #fields, 2 do
    local count = tonumber(fields[j + 1])
    local name = string.sub(fields[j], 6)
    if string.sub(fields[j], 1, 5) == 'page:' then
      pages[name] = (pages[name] or 0) + count
      dayViews = dayViews + count
    else
      name = string.sub(fields[j], 8)
      sources[name] = (sources[name] or 0) + count
    end
  end
  views = views + dayViews
  table.insert(daily, {date = ARGV[(i + 1) / 2], visitors = #visitors, pageViews = dayViews})
end
local unique = 0
local returning = 0
for _, days in pairs(actors) do
  unique = unique + 1
  if days > 1 then returning = returning + 1 end
end
return cjson.encode({visitors = unique, pageViews = views, returningVisitors = returning, daily = daily, pages = pages, sources = sources})`;

export class RedisAnalyticsStore implements AnalyticsStore {
  private readonly redis: Redis;
  constructor(url: string, token: string) { this.redis = new Redis({ url, token, automaticDeserialization: false }); }

  async record(visit: Visit) {
    const date = dateKey(visit.at);
    await this.redis.eval(RECORD, [`${PREFIX}started`, `${PREFIX}${date}:actors`, `${PREFIX}${date}:counts`], [visit.at, visit.actor, visit.page, visit.source, Math.floor((dayStart(visit.at) + RETENTION_DAYS * DAY) / 1000)]);
  }

  async startedAt() {
    const value = await this.redis.get<string>(`${PREFIX}started`);
    return value === null ? null : Number(value);
  }

  async read(start: number, end: number): Promise<TrafficPeriod> {
    const dates: string[] = [];
    for (let at = start; at < end; at += DAY) dates.push(dateKey(at));
    const raw = await this.redis.eval(READ, dates.flatMap((date) => [`${PREFIX}${date}:actors`, `${PREFIX}${date}:counts`]), dates) as string;
    const data = JSON.parse(raw) as Omit<TrafficPeriod, "pages" | "sources"> & { pages: Record<string, number>; sources: Record<string, number> };
    return { ...data, pages: rankedCounts(data.pages), sources: rankedCounts(data.sources) };
  }
}

let store: AnalyticsStore | undefined;

export function getAnalyticsStore(): AnalyticsStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (process.env.DATABASE_URL) store = new PostgresAnalyticsStore(createPostgresPool(process.env.DATABASE_URL));
  else if (url && token) store = new RedisAnalyticsStore(url, token);
  else if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new HttpError(503, "storage_missing", "Analytics storage isn't configured yet.");
  else store = new MemoryAnalyticsStore();
  return store;
}
