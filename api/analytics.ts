import { apiHandler } from "../server/api-security.js";
import { authorize } from "../server/admin.js";
import { analyticsVisitor, ignoreTraffic, parseVisit, readAnalytics } from "../server/analytics.js";
import { getAnalyticsStore } from "../server/analytics-store.js";
import { requireSameOriginJson } from "../server/community.js";
import { getCommunityStore } from "../server/community-store.js";
import { getStore } from "../server/db.js";
import { HttpError, json, readJson } from "../server/http.js";
import { clientKey } from "../server/rate-limit.js";
import type { AnalyticsDays } from "../shared/analytics.js";

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requireSameOriginJson(req);
    if (ignoreTraffic(req)) return json({ ok: true }, 200, { "cache-control": "no-store" });
    const input = parseVisit(req, await readJson(req));
    const session = analyticsVisitor(req);
    const store = getStore();
    const allowed = await Promise.all([
      store.rateLimit(`analytics:ip:${clientKey(req)}`, 240, 60),
      store.rateLimit(`analytics:visitor:${session.actor}`, 60, 60),
    ]);
    if (allowed.some((value) => !value)) throw new HttpError(429, "rate_limited", "Too many visits. Try again later.", undefined, { "retry-after": "60" });
    await getAnalyticsStore().record({ ...input, actor: session.actor, at: Date.now() });
    return json({ ok: true }, 200, session.headers);
  });
}

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    await authorize(req);
    const days = Number(new URL(req.url).searchParams.get("days") ?? "30");
    if (![7, 30, 90].includes(days)) throw new HttpError(400, "invalid_period", "Choose 7, 30 or 90 days.");
    return json(await readAnalytics(getAnalyticsStore(), getStore(), getCommunityStore(), days as AnalyticsDays), 200, { "cache-control": "private, no-store", vary: "Cookie" });
  });
}
