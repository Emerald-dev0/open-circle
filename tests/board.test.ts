import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminAction, authorize } from "../server/admin";
import { previewProfile, readBoard, rebuildBoard, register } from "../server/board";
import { decodeMember, encodeMember } from "../server/store";
import { handle, json } from "../server/http";
import type { Board } from "../shared/types";
import { boardFixture, githubJson, githubOwner, githubRepository, memberRecord, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";
import { contributionStart, DEFAULT_WEIGHTS, scoreOf } from "../shared/ranking";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
const community = vi.hoisted(() => ({ counts: {} as Record<string, number> }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: community.counts, voted: [] }) }) }));

const input = { github: "Octocat", nickname: "Octo", whatsapp: "+234 803 123 4567" };

function githubProfiles() {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { variables } = JSON.parse(String(init.body));
    const data = Object.fromEntries(Object.entries(variables)
      .filter(([key]) => /^l\d+$/.test(key))
      .map(([key, login]) => [key.replace("l", "u"), githubOwner({ login })]));
    return githubJson({ data });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  community.counts = {};
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OpenCircle member registration", () => {
  it("previews an existing member with the same contribution dates and upvote weights as their board score", async () => {
    const fetchMock = githubProfiles();
    const store = new TestStore();
    const createdAt = Date.parse("2026-08-01T18:00:00Z");
    await store.createMember(memberRecord({ createdAt }));
    community.counts = { "repo:R_open-kit": 2, "tool:R_open-kit": 100 };
    const board = await rebuildBoard(store);

    const preview = await previewProfile(store, "Octocat", input.whatsapp);

    expect(preview.score).toBe(board.members[0].score);
    expect(preview.score).toBe(20);
    expect(preview.githubScore).toBe(70);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).variables.f0_0).toBe("2026-08-01T00:00:00.000Z");
  });

  it("previews a username with a group number without registering during preview", async () => {
    githubProfiles();
    const store = new TestStore();

    const preview = await previewProfile(store, "https://github.com/Octocat/", input.whatsapp);

    expect(preview.profile.login).toBe("Octocat");
    expect(preview.score).toBe(20);
    expect(preview.githubScore).toBe(68);
    expect(await store.listMembers()).toEqual([]);
  });

  it("registers normalized details, returns a real rank and keeps phone numbers out of the public response", async () => {
    githubProfiles();
    const store = new TestStore();

    const response = await handle(async () => json(await register(store, { ...input, nickname: "  Octo   Cat  " })));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.login).toBe("Octocat");
    expect(result.board.members).toMatchObject([{ login: "Octocat", nickname: "Octo Cat", rank: 1, score: 20, githubScore: 68 }]);
    expect(result.board.repositories).toMatchObject([{ fullName: "Octocat/open-kit", rank: 1, stars: 10, ownerNickname: "Octo Cat" }]);
    expect(await store.getMember("octocat")).toMatchObject({ whatsapp: "+2348031234567", nickname: "Octo Cat" });
    expect(await store.getMember("octocat")).toMatchObject({ activitySince: contributionStart(Date.now()) });
    expect(JSON.stringify(result)).not.toContain('"whatsapp":');
    expect(JSON.stringify(result)).not.toContain("8031234567");
    expect(result.board.invite.url).toBe("https://chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q?mode=gi_t");
  });

  it.each([
    [{ ...input, github: "https://github.com/Octocat/repo" }, "invalid_github"],
    [{ ...input, github: "https://example.com/Octocat" }, "invalid_github"],
    [{ ...input, nickname: "https://spam.com" }, "invalid_nickname"],
    [{ ...input, whatsapp: "not-a-phone" }, "invalid_whatsapp"],
  ])("rejects invalid member details before contacting GitHub", async (body, code) => {
    const fetchMock = githubProfiles();
    const store = new TestStore();
    const response = await handle(async () => json(await register(store, body)));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await store.listMembers()).toEqual([]);
  });

  it.each([
    [null, 404, "not_found"],
    [{ __typename: "Organization", login: "Octocat", avatarUrl: "" }, 422, "organization"],
  ])("rejects nonexistent users and organisations without creating members", async (owner, status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: owner } })));
    const store = new TestStore();
    const response = await handle(async () => json(await register(store, input)));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code, field: "github" } });
    expect(await store.listMembers()).toEqual([]);
  });

  it("allows retries by the same account and phone while rejecting another phone claiming it", async () => {
    const fetchMock = githubProfiles();
    const store = new TestStore();
    await register(store, input);

    const retried = await register(store, { ...input, github: "@OCTOCAT", nickname: "Different" });

    expect(retried.board.members).toHaveLength(1);
    expect(retried.board.members[0].nickname).toBe("Octo");
    await expect(register(store, { ...input, whatsapp: "+447700900123" })).rejects.toMatchObject({ status: 409, code: "github_taken" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes simultaneous registration retries idempotent", async () => {
    githubProfiles();
    const store = new TestStore();

    const results = await Promise.all([register(store, input), register(store, input)]);

    expect(results.map((result) => result.login)).toEqual(["Octocat", "Octocat"]);
    expect(await store.listMembers()).toHaveLength(1);
    expect(results.every((result) => result.board.members.length === 1)).toBe(true);
  });

  it("prevents another GitHub account from reusing a phone or nickname", async () => {
    githubProfiles();
    const store = new TestStore();
    await register(store, input);

    await expect(register(store, { ...input, github: "another", nickname: "Another" })).rejects.toMatchObject({ status: 409, code: "whatsapp_taken", field: "whatsapp" });
    await expect(register(store, { ...input, github: "another", nickname: "OCTO", whatsapp: "+447700900123" })).rejects.toMatchObject({ status: 409, code: "nickname_taken", field: "nickname" });
    expect(await store.listMembers()).toHaveLength(1);
  });

  it("accepts an international WhatsApp number with a country code", async () => {
    githubProfiles();
    const store = new TestStore();

    await register(store, { ...input, whatsapp: "+44 7700 900123" });

    expect(await store.getMember("octocat")).toMatchObject({ whatsapp: "+447700900123" });
  });
});

describe("Member and repository board updates", () => {
  it("lets contributions above 100 and repo upvotes move a member ahead of more-starred accounts", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord({ stars: 0, activity: 110, projects: [repository()] }));
    await store.createMember(memberRecord({ login: "second", displayLogin: "Second", nickname: "Second", whatsapp: "+447700900123", stars: 20, activity: 20, projects: [] }));

    expect((await rebuildBoard(store)).members[0].login).toBe("Second");
    const updated = await rebuildBoard(store, { voteCounts: { "repo:R_open-kit": 11, "repo:unlisted": 1000, "tool:R_open-kit": 1000 } });

    expect(updated.members[0]).toMatchObject({ login: "Octocat", activity: 110, upvotes: 11, score: 20, githubScore: 130, delta: 1 });
    expect(updated.members[1]).toMatchObject({ login: "Second", upvotes: 0, score: 20, githubScore: 129 });
    expect(updated.repositories[0].stars).toBe(10);
    expect(scoreOf({ stars: 0, followers: 0, repos: 0, activity: 1000, upvotes: 2 }, DEFAULT_WEIGHTS)).toBe(1002);
  });

  it("backfills older members from their original joining day without treating old 30-day totals as cumulative", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const store = new TestStore();
    const legacy = memberRecord({ createdAt: Date.parse("2026-08-01T18:00:00Z"), activity: 99 });
    delete legacy.activitySince;
    await store.createMember(legacy);
    await store.setBoard(boardFixture({ rankingVersion: undefined }));
    const fetchMock = githubProfiles();
    const work: Promise<unknown>[] = [];

    const pending = await readBoard(store, (promise) => { work.push(promise); });
    expect(pending.members[0].activity).toBe(0);
    expect(pending.statsDelayed).toBe(true);
    await Promise.all(work);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).variables.f0_0).toBe("2026-08-01T00:00:00.000Z");
    expect((await store.getBoard())?.members[0]).toMatchObject({ activity: 9, score: 20, githubScore: 68 });
    expect((await store.getBoard())?.statsDelayed).toBe(false);
  });

  it("replaces cumulative totals on refresh without double counting or moving the joining date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const store = new TestStore();
    const createdAt = Date.parse("2026-08-01T18:00:00Z");
    await store.createMember(memberRecord({ createdAt }));
    await rebuildBoard(store);
    const fetchMock = githubProfiles();

    for (let i = 0; i < 2; i++) {
      vi.setSystemTime(Date.now() + 86_400_000);
      const work: Promise<unknown>[] = [];
      await readBoard(store, (promise) => { work.push(promise); });
      await Promise.all(work);
      expect((await store.getBoard())?.members[0]).toMatchObject({ activity: 9, score: 20, githubScore: 68 });
    }
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "https://api.github.com/graphql").map((call) => JSON.parse(call[1].body as string).variables.f0_0))
      .toEqual(["2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"]);
  });

  it("automatically spotlights one eligible repository per developer, then ranks them by stars", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord({ projects: [repository({ id: "R_z", name: "z", fullName: "Octocat/z", stars: 5, forks: 2 }), repository({ id: "R_a", name: "a", fullName: "Octocat/a", stars: 5, forks: 2 })] }));
    await store.createMember(memberRecord({ login: "second", displayLogin: "Second", nickname: "Second", whatsapp: "+2348031234568", stars: 0, projects: [repository({ id: "R_top", fullName: "Second/top", stars: 50, forks: 0 }), repository({ id: "R_forks", fullName: "Second/forks", stars: 5, forks: 3 })] }));

    const board = await rebuildBoard(store);

    expect(board.members.map((member) => member.login)).toEqual(["Octocat", "Second"]);
    expect(board.repositories.map((repo) => [repo.id, repo.rank])).toEqual([["R_top", 1], ["R_a", 2]]);
  });

  it("moves members when their scores change and preserves the original daily movement rank", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord());
    await store.createMember(memberRecord({ login: "second", displayLogin: "Second", nickname: "Second", whatsapp: "+2348031234568", stars: 20 }));
    expect((await rebuildBoard(store)).members.map((member) => member.login)).toEqual(["Second", "Octocat"]);

    await store.patchMember("octocat", { stars: 30 });
    const moved = await rebuildBoard(store);
    expect(moved.members.find((member) => member.login === "Octocat")).toMatchObject({ rank: 1, delta: 1 });
    expect(moved.members.find((member) => member.login === "Second")).toMatchObject({ rank: 2, delta: -1 });

    await store.patchMember("octocat", { stars: 40 });
    expect((await rebuildBoard(store)).members[0]).toMatchObject({ login: "Octocat", delta: 1 });
  });

  it("hides a member's repositories together with their public ranking and restores both on unhide", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord());
    await rebuildBoard(store);

    const hidden = await adminAction(store, { action: "hide", login: "OCTOCAT" });

    expect(hidden.members[0]).toMatchObject({ hidden: true, rank: 0, whatsapp: "+234 803 123 4567" });
    expect(await store.getBoard()).toMatchObject({ members: [], repositories: [] });
    await expect(register(store, input)).rejects.toMatchObject({ code: "removed" });
    await adminAction(store, { action: "unhide", login: "octocat" });
    expect(await store.getBoard()).toMatchObject({ members: [{ login: "Octocat" }], repositories: [{ id: "R_open-kit" }] });
  });

  it("rebuilds old snapshots without repository data and decodes old member records", async () => {
    const store = new TestStore();
    const legacy = memberRecord();
    delete legacy.projects;
    const decoded = decodeMember(encodeMember(legacy));
    expect(decoded.projects).toEqual([]);
    await store.createMember(decoded);
    const oldBoard = boardFixture();
    delete (oldBoard as Partial<Board>).repositories;
    await store.setBoard(oldBoard);

    const board = await readBoard(store);

    expect(board.members).toMatchObject([{ login: "Octocat", rank: 1, score: 20, githubScore: 68 }]);
    expect(board.repositories).toEqual([]);
    expect(decodeMember(encodeMember(memberRecord())).projects).toEqual([repository()]);
  });

  it("returns the saved board immediately and keeps all previous numbers when GitHub refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const store = new TestStore();
    await store.createMember(memberRecord());
    const initial = await rebuildBoard(store);
    vi.setSystemTime(Date.now() + 61_000);
    const fetchMock = vi.fn().mockResolvedValue(githubJson({}, 403));
    vi.stubGlobal("fetch", fetchMock);
    const work: Promise<unknown>[] = [];

    const cached = await readBoard(store, (promise) => { work.push(promise); });
    await Promise.all(work);
    const delayed = await store.getBoard();

    expect(cached).toEqual(initial);
    expect(delayed?.statsDelayed).toBe(true);
    expect(delayed?.refreshedAt).toBe(initial.refreshedAt);
    expect(delayed?.members).toEqual(initial.members);
    expect(delayed?.repositories).toEqual(initial.repositories);
    await readBoard(store, (promise) => { work.push(promise); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0])).sort()).toEqual(["https://api.github.com/graphql", "https://api.github.com/repos/opencirclehq/open-circle"].sort());
  });

  it("refreshes developer scores and repository standings from the same GitHub snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const store = new TestStore();
    await store.createMember(memberRecord());
    const initial = await rebuildBoard(store);
    vi.setSystemTime(Date.now() + 61_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({ data: { u0: githubOwner({ repositories: {
      totalCount: 1,
      nodes: [githubRepository(60, { id: "R_open-kit", name: "open-kit", nameWithOwner: "Octocat/open-kit" })],
      pageInfo: { hasNextPage: false, endCursor: null },
    } }) } })));
    const work: Promise<unknown>[] = [];

    await readBoard(store, (promise) => { work.push(promise); });
    await Promise.all(work);
    const updated = await store.getBoard();

    expect(updated?.members[0]).toMatchObject({ score: 20, githubScore: 318, stars: 60 });
    expect(updated?.repositories[0]).toMatchObject({ stars: 60, rank: 1 });
    expect(updated?.refreshedAt).toBeGreaterThan(initial.refreshedAt);
    expect(updated?.statsDelayed).toBe(false);
  });

  it("keeps admin disabled when only the retired server secret is configured", async () => {
    vi.stubEnv("ADMIN_SECRET", "private-admin-key");
    vi.stubEnv("ADMIN_GITHUB_IDS", "");
    await expect(authorize(new Request("https://example.test/api/admin"))).rejects.toMatchObject({ status: 503 });
    await expect(authorize(new Request("https://example.test/api/admin", { headers: { authorization: "Bearer private-admin-key" } }))).rejects.toMatchObject({ status: 503 });
  });
});
