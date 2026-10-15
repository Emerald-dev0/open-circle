import { createHash, randomBytes } from "node:crypto";
import { ANALYTICS_PAGES, type AdminAnalytics, type AnalyticsDays, type AnalyticsPage } from "../shared/analytics.js";
import type { CommunityStore } from "./community-contract.js";
import type { Store } from "./store.js";
import { DAY, dateKey, dayStart, type AnalyticsStore } from "./analytics-store.js";
import { HttpError } from "./http.js";

const COOKIE = "opencircle_analytics";

export function analyticsVisitor(req: Request) {
  const saved = req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const token = saved && /^[a-f0-9]{64}$/.test(saved) ? saved : randomBytes(32).toString("hex");
  return {
    actor: createHash("sha256").update(`analytics:${token}`).digest("hex"),
    headers: {
      "cache-control": "private, no-store",
      vary: "Cookie",
      ...(token === saved ? {} : { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === "https:" ? "; Secure" : ""}` }),
    },
  };
}

export function ignoreTraffic(req: Request) {
  return req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1" || /bot|crawler|spider|headless|preview|lighthouse/i.test(req.headers.get("user-agent") ?? "");
}

export function parseVisit(req: Request, input: unknown): { page: AnalyticsPage; source: string } {
  const body = input as { page?: unknown; referrer?: unknown } | null;
  if (typeof body?.page !== "string" || !Object.hasOwn(ANALYTICS_PAGES, body.page))
    throw new HttpError(400, "invalid_page", "Choose a public page to record.");
  if (typeof body.referrer !== "string" || body.referrer.length > 2048)
    throw new HttpError(400, "invalid_referrer", "That referral address isn't valid.");
  let source = "Direct";
  if (body.referrer) {
    try {
      const url = new URL(body.referrer);
      if (["https:", "http:"].includes(url.protocol) && url.hostname !== new URL(req.url).hostname) {
        const hostname = url.hostname.replace(/^www\./, "");
        if (/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostname)) source = hostname;
      }
    } catch { source = "Direct"; }
  }
  return { page: body.page as AnalyticsPage, source };
}

export async function readAnalytics(analytics: AnalyticsStore, members: Store, community: CommunityStore, days: AnalyticsDays, now = Date.now()): Promise<AdminAnalytics> {
  const end = dayStart(now) + DAY;
  const start = end - days * DAY;
  const previousStart = start - days * DAY;
  const [current, previous, startedAt, records, tools] = await Promise.all([
    analytics.read(start, end), analytics.read(previousStart, start), analytics.startedAt(), members.listMembers(), community.listTools(),
  ]);
  const daily = new Map(current.daily.map((day) => [day.date, day]));
  current.daily = Array.from({ length: days }, (_, index) => {
    const date = dateKey(start + index * DAY);
    return daily.get(date) ?? { date, visitors: 0, pageViews: 0 };
  });
  const count = (entries: { createdAt: number }[], from: number, to: number) => entries.filter((entry) => entry.createdAt >= from && entry.createdAt < to).length;
  return {
    days, generatedAt: now, startedAt, current,
    previous: startedAt !== null && startedAt <= previousStart ? previous : null,
    growth: {
      members: count(records, start, end), previousMembers: count(records, previousStart, start),
      toolSubmissions: count(tools, start, end), previousToolSubmissions: count(tools, previousStart, start),
      pendingTools: tools.filter((tool) => tool.status !== "approved").length,
    },
  };
}
