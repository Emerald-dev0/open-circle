import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rebuildBoard, previewProfile } from "../server/board";
import { coordinationRequest } from "../server/participation";
import { communityScore, projectedRank } from "../shared/ranking";
import { isHelperLeaderboard } from "../shared/coordination";
import { TestStore } from "./helpers/test-store";
import { githubJson, githubOwner, memberRecord } from "./helpers/fixtures";
import { decodeMember, encodeMember } from "../server/store";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));
const now = Date.parse("2026-10-15T17:00:00Z");
const snapshot = (members: unknown[] = [{ login: "Octocat", points: 25, contributions: 1, peers: 1 }]) => ({ version: 1, generatedAt: Date.now(), windowStartedAt: Date.now() - 28 * 86400000, members });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "https://bot.test/api/v1/membership");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_TOKEN", "a".repeat(32));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("one confirmed useful contribution outranks unlimited popularity and upvotes", async () => {
  const store = new TestStore();
  await store.createMember(memberRecord({ stars: 0, followers: 0, repos: 0, activity: 0 }));
  await store.createMember(memberRecord({ login: "popular", displayLogin: "Popular", nickname: "Popular", whatsapp: "+447700900123", stars: 1000000, followers: 1000000, activity: 1000000 }));
  const request = vi.fn().mockResolvedValue(githubJson(snapshot())); vi.stubGlobal("fetch", request);
  const board = await rebuildBoard(store, { voteCounts: { "repo:R_open-kit": 1000000 } });
  expect(board.members).toMatchObject([{ login: "Octocat", score: 45, helperPoints: 25, helpfulContributions: 1, helpedMembers: 1 }, { login: "Popular", score: 20 }]);
  expect(board.helpersDelayed).toBe(false);
  expect(request.mock.calls[0][0].href).toBe("https://bot.test/api/v1/coordination/helpers");
  expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", body: "{}", headers: { authorization: `Bearer ${"a".repeat(32)}` } });
  await rebuildBoard(store); expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(board)).not.toContain('"whatsapp":');
  expect(JSON.stringify(board)).not.toContain("8031234567");
  expect(communityScore(Number.MAX_SAFE_INTEGER, 0)).toBe(20);
  expect(communityScore(0, 25)).toBeGreaterThan(communityScore(Number.MAX_SAFE_INTEGER, 0));
});

it("preserves helper points through outages, retries at most once a minute, and applies revocations after recovery", async () => {
  const store = new TestStore(); await store.createMember(memberRecord());
  const request = vi.fn().mockResolvedValue(githubJson(snapshot())); vi.stubGlobal("fetch", request);
  await rebuildBoard(store);
  vi.setSystemTime(now + 61000); request.mockRejectedValue(new Error("offline"));
  const delayed = await rebuildBoard(store);
  expect(delayed).toMatchObject({ helpersDelayed: true, helpersUpdatedAt: now, members: [{ score: 45, helperPoints: 25 }] });
  await rebuildBoard(store); expect(request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(now + 122000); request.mockResolvedValue(githubJson(snapshot([])));
  const recovered = await rebuildBoard(store);
  expect(recovered).toMatchObject({ helpersDelayed: false, members: [{ score: 20, helperPoints: 0, helpfulContributions: 0 }] });
  expect(await store.getMember("octocat")).toMatchObject({ helperPoints: 0 });
});

it("keeps private cached helper points on hidden members, preserves storage round trips and uses the same score in previews", async () => {
  const store = new TestStore(); await store.createMember(memberRecord({ hidden: true }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson(snapshot())));
  expect((await rebuildBoard(store)).members).toEqual([]);
  const record = (await store.getMember("octocat"))!;
  expect(decodeMember(encodeMember(record))).toMatchObject({ helperPoints: 25, helpfulContributions: 1, helpedMembers: 1 });
  await store.patchMember("octocat", { hidden: false });
  const board = await rebuildBoard(store); expect(board.members[0].score).toBe(45);
  vi.stubEnv("GITHUB_TOKEN", "test"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner() } })));
  expect((await previewProfile(store, "Octocat", "+2348031234567")).score).toBe(board.members[0].score);
});

it("validates point arithmetic, identities, timestamps, duplicate accounts and bounded service responses", async () => {
  for (const invalid of [snapshot([{ login: "Octocat", points: 999, contributions: 1, peers: 1 }]), snapshot([{ login: "Octocat", points: 25, contributions: 1, peers: 1 }, { login: "octocat", points: 0, contributions: 0, peers: 0 }]), { ...snapshot(), generatedAt: now + 120001 }, { ...snapshot(), generatedAt: now - 120001, windowStartedAt: now - 120001 - 28 * 86400000 }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson(invalid)));
    await expect(coordinationRequest("helpers", {})).rejects.toMatchObject({ status: 503 });
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ".repeat(2097153))));
  await expect(coordinationRequest("helpers", {})).rejects.toMatchObject({ status: 503 });
  expect(isHelperLeaderboard(snapshot())).toBe(true);
  expect(projectedRank({ score: 45, stars: 0, helpedMembers: 2, githubScore: 0 }, [{ score: 45, stars: 100, helpedMembers: 1, githubScore: 999 }])).toBe(1);
  expect(projectedRank({ score: 45, stars: 0, helperPoints: 45, helpedMembers: 1, githubScore: 0 }, [{ score: 45, stars: 1000000, helperPoints: 25, helpedMembers: 1, githubScore: 9999999 }])).toBe(1);
});
