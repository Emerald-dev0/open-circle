import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsVisitor, ignoreTraffic, parseVisit, readAnalytics } from "../server/analytics";
import { DAY, dayStart, MemoryAnalyticsStore } from "../server/analytics-store";
import { MemoryCommunityStore } from "../server/community-memory";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const actor = (value: string) => createHash("sha256").update(value).digest("hex");
const now = Date.parse("2026-10-15T12:30:00Z");
const today = dayStart(now);

describe("Traffic analytics", () => {
  it("counts each browser once across pages and days while preserving every page view", async () => {
    const store = new MemoryAnalyticsStore(null);
    const visit = { actor: actor("one"), page: "/" as const, source: "github.com", at: today - DAY };
    await store.record(visit);
    await store.record(visit);
    await store.record({ ...visit, at: today, page: "/tools" });
    await store.record({ ...visit, actor: actor("two"), at: today, source: "Direct" });
    const period = await store.read(today - DAY, today + DAY);
    expect(period).toMatchObject({ visitors: 2, pageViews: 4, returningVisitors: 1 });
    expect(period.daily).toEqual([{ date: "2026-10-14", visitors: 1, pageViews: 2 }, { date: "2026-10-15", visitors: 2, pageViews: 2 }]);
    expect(period.pages).toEqual([{ name: "/", views: 3 }, { name: "/tools", views: 1 }]);
    expect(period.sources).toEqual([{ name: "github.com", views: 3 }, { name: "Direct", views: 1 }]);
    expect((await store.read(today, today + DAY)).returningVisitors).toBe(0);
  });

  it("persists counts without IPs and prunes traffic outside the retention window", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "oc-analytics-"));
    const file = path.join(directory, "traffic.json");
    try {
      const store = new MemoryAnalyticsStore(file);
      const visit = { actor: actor("one"), page: "/" as const, source: "Direct", at: today - 180 * DAY };
      await store.record(visit);
      await store.record({ ...visit, at: today });
      expect((await new MemoryAnalyticsStore(file).read(today - 181 * DAY, today + DAY)).pageViews).toBe(1);
      const saved = JSON.parse(readFileSync(file, "utf8"));
      expect(Object.keys(saved.days)).toEqual(["2026-10-15"]);
      expect(JSON.stringify(saved)).not.toContain('"ip"');
      expect(await store.startedAt()).toBe(visit.at);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("zero-fills daily data, separates prior UTC periods, and derives growth from real records", async () => {
    const traffic = new MemoryAnalyticsStore(null);
    const members = new TestStore();
    const community = new MemoryCommunityStore(null);
    await members.createMember(memberRecord({ createdAt: today - 6 * DAY }));
    await community.createTool({ id: "shared", name: "Shared", url: "https://shared.example", category: "Development", description: "A useful tool", source: "community", status: "pending", createdAt: today });
    await traffic.record({ actor: actor("old"), page: "/", source: "Direct", at: today - 14 * DAY });
    await traffic.record({ actor: actor("previous"), page: "/tools", source: "Direct", at: today - 7 * DAY });
    await traffic.record({ actor: actor("current"), page: "/", source: "Direct", at: today });
    const data = await readAnalytics(traffic, members, community, 7, now);
    expect(data.current).toMatchObject({ visitors: 1, pageViews: 1 });
    expect(data.current.daily).toHaveLength(7);
    expect(data.current.daily[0]).toEqual({ date: "2026-10-09", visitors: 0, pageViews: 0 });
    expect(data.previous).toMatchObject({ visitors: 1, pageViews: 1 });
    expect(data.growth).toEqual({ members: 1, previousMembers: 0, toolSubmissions: 1, previousToolSubmissions: 0, pendingTools: 1 });
    const fresh = await readAnalytics(new MemoryAnalyticsStore(null), members, community, 90, now);
    expect(fresh.startedAt).toBeNull();
    expect(fresh.previous).toBeNull();
    expect(fresh.current.daily).toHaveLength(90);
  });

  it("sets an independent secure anonymous cookie and reuses it without exposing its token", () => {
    const first = analyticsVisitor(new Request("https://opencircle.test/api/analytics"));
    const cookie = first.headers["set-cookie"]!;
    expect(cookie).toContain("HttpOnly; SameSite=Lax");
    expect(cookie).toContain("; Secure");
    expect(cookie).not.toContain(first.actor);
    const next = analyticsVisitor(new Request("https://opencircle.test/api/analytics", { headers: { cookie: cookie.split(";")[0] } }));
    expect(next.actor).toBe(first.actor);
    expect(next.headers["set-cookie"]).toBeUndefined();
  });

  it("records only allowed paths and referral hostnames, dropping credentials, paths and queries", () => {
    const request = new Request("https://opencircle.test/api/analytics");
    expect(parseVisit(request, { page: "/tools", referrer: "https://user:secret@www.github.com/private?email=person@example.com#token" })).toEqual({ page: "/tools", source: "github.com" });
    for (const referrer of ["https://opencircle.test/admin", "javascript:alert(1)", "invalid", ""]) expect(parseVisit(request, { page: "/", referrer }).source).toBe("Direct");
    for (const page of ["/admin", "/api/admin", "/?token=secret", "__proto__"]) expect(() => parseVisit(request, { page, referrer: "" })).toThrow();
    expect(() => parseVisit(request, { page: "/", referrer: "x".repeat(2049) })).toThrow();
  });

  it("ignores privacy opt-outs and known bots", () => {
    const cases: Record<string, string>[] = [{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot" }, { "user-agent": "HeadlessChrome" }];
    for (const headers of cases) expect(ignoreTraffic(new Request("https://opencircle.test", { headers }))).toBe(true);
    expect(ignoreTraffic(new Request("https://opencircle.test", { headers: { "user-agent": "Mozilla/5.0 Chrome" } }))).toBe(false);
  });
});
