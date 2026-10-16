import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rebuildBoard, previewProfile } from "../server/board";
import { coordinationRequest } from "../server/participation";
import { communityScore, projectedRank } from "../shared/ranking";
import { isHelperHistory } from "../shared/coordination";
import { TestStore } from "./helpers/test-store";
import { githubJson, githubOwner, helperHistoryFixture, memberRecord } from "./helpers/fixtures";
import { decodeMember, encodeMember } from "../server/store";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));
const now = Date.parse("2026-10-15T17:00:00Z");
const snapshot = (members = [{ login: "Octocat", points: 25, contributions: 1, peers: 1 }]) => helperHistoryFixture(members);
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
  expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", body: '{"version":2}', headers: { authorization: `Bearer ${"a".repeat(32)}` } });
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
    await expect(coordinationRequest("helpers", { version: 2 })).rejects.toMatchObject({ status: 503 });
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ".repeat(6291457))));
  await expect(coordinationRequest("helpers", { version: 2 })).rejects.toMatchObject({ status: 503 });
  expect(isHelperHistory(snapshot())).toBe(true);
  expect(projectedRank({ score: 45, stars: 0, helpedMembers: 2, githubScore: 0 }, [{ score: 45, stars: 100, helpedMembers: 1, githubScore: 999 }])).toBe(1);
  expect(projectedRank({ score: 45, stars: 0, helperPoints: 45, helpedMembers: 1, githubScore: 0 }, [{ score: 45, stars: 1000000, helperPoints: 25, helpedMembers: 1, githubScore: 9999999 }])).toBe(1);
});


it("caches independent period rankings, keeps all-time credit through outages and replaces every period after revocation", async () => {
  const store = new TestStore();
  await store.createMember(memberRecord({ starredRepositories: [{ repositoryId: "R_peer", ownerLogin: "peer", starredAt: now - 90 * 86400000 }] }));
  await store.createMember(memberRecord({ login: "peer", displayLogin: "Peer", nickname: "Peer", whatsapp: "+447700900123", stars: 0, followers: 0, repos: 0, activity: 0 }));
  const old = { login: "Octocat", points: 75, contributions: 3, peers: 3 };
  const recent = { login: "Peer", points: 25, contributions: 1, peers: 1 };
  const zero = { login: "Octocat", points: 0, contributions: 0, peers: 0 };
  const history = helperHistoryFixture([old, recent], { "7d": [zero, recent], "30d": [{ ...zero, points: 25, contributions: 1, peers: 1 }, recent] });
  const request = vi.fn().mockImplementation(async () => githubJson(history));
  vi.stubGlobal("fetch", request);
  const board = await rebuildBoard(store);
  expect(board.helperHistoryReady).toBe(true);
  expect(board.members.map((member) => [member.login, member.score, member.starHelps])).toEqual([["Octocat", 115, 1], ["Peer", 25, 0]]);
  expect(board.periods?.["7d"].map((member) => [member.login, member.score, member.rank])).toEqual([["Peer", 25, 1], ["Octocat", 20, 2]]);
  expect(board.periods?.["30d"].map((member) => [member.login, member.score])).toEqual([["Octocat", 45], ["Peer", 25]]);
  expect(board.periods?.["7d"].every((member) => member.delta === 0)).toBe(true);
  const record = (await store.getMember("octocat"))!;
  expect(decodeMember(encodeMember(record)).helperPeriods).toEqual(record.helperPeriods);
  expect(JSON.stringify(board)).not.toContain('"helperPeriods"');
  expect(JSON.stringify(board)).not.toContain('"whatsapp"');
  vi.setSystemTime(now + 61000);
  request.mockRejectedValue(new Error("offline"));
  const cached = await rebuildBoard(store);
  expect(cached.helpersDelayed).toBe(true);
  expect(cached.periods).toEqual(board.periods);
  expect(cached.members[0].score).toBe(115);
  vi.setSystemTime(now + 122000);
  request.mockImplementation(async () => githubJson(helperHistoryFixture([zero, recent])));
  const revoked = await rebuildBoard(store);
  expect(revoked.helpersDelayed).toBe(false);
  expect(revoked.members.find((member) => member.login === "Octocat")).toMatchObject({ score: 40, helpfulContributions: 0 });
  expect(revoked.periods?.["7d"].find((member) => member.login === "Octocat")).toMatchObject({ score: 20, helpfulContributions: 0 });
});

it("does not present a legacy 28-day aggregate as a recent period when history is unavailable", async () => {
  const store = new TestStore(); await store.createMember(memberRecord({ helperPoints: 25, helpfulContributions: 1, helpedMembers: 1 }));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => githubJson({ version: 1, generatedAt: Date.now(), windowStartedAt: Date.now() - 28 * 86400000, members: [{ login: "Octocat", points: 25, contributions: 1, peers: 1 }] })));
  const board = await rebuildBoard(store);
  expect(board).toMatchObject({ helpersDelayed: true, helperHistoryReady: false });
  expect(board.periods).toBeUndefined();
  expect(board.members[0].helperPoints).toBe(25);
});

it("loads a newly added member's period history immediately without interrupting existing period views", async () => {
  const store = new TestStore(); await store.createMember(memberRecord());
  const request = vi.fn().mockImplementation(async () => githubJson(helperHistoryFixture([
    { login: "Octocat", points: 25, contributions: 1, peers: 1 },
    { login: "Peer", points: 50, contributions: 2, peers: 2 },
  ])));
  vi.stubGlobal("fetch", request);
  await rebuildBoard(store);
  await store.createMember(memberRecord({ login: "peer", displayLogin: "Peer", nickname: "Peer", whatsapp: "+447700900123" }));
  const joined = await rebuildBoard(store);
  expect(request).toHaveBeenCalledTimes(2);
  expect(joined.helperHistoryReady).toBe(true);
  expect(joined.periods?.["7d"].find((member) => member.login === "Peer")).toMatchObject({ helperPoints: 50, helpfulContributions: 2 });
  await rebuildBoard(store);
  expect(request).toHaveBeenCalledTimes(2);
});
