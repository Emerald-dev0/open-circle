import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBoard, rebuildBoard } from "../server/board";
import { lookupCommunityRepository } from "../server/community-spotlight";
import { COMMUNITY_REPOSITORY } from "../shared/spotlight";
import { githubJson, boardFixture, memberRecord, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));
const now = Date.parse("2026-10-16T20:00:00Z");
const githubRepository = (fields: Record<string, unknown> = {}) => ({
  node_id: "R_community", name: "open-circle", full_name: COMMUNITY_REPOSITORY, html_url: `https://github.com/${COMMUNITY_REPOSITORY}`,
  description: "GitHub profiles, repositories and developer tools for the Open Source Circle community.",
  stargazers_count: 30, forks_count: 4, language: "TypeScript", updated_at: "2026-10-16T18:00:00Z", private: false, fork: false,
  owner: { login: "opencirclehq", avatar_url: "https://avatars.githubusercontent.com/u/342771377?v=4" }, ...fields,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("loads real public organization repository metadata without creating a community member", async () => {
  const request = vi.fn().mockResolvedValue(githubJson(githubRepository()));
  vi.stubGlobal("fetch", request);
  expect(await lookupCommunityRepository()).toMatchObject({ id: "R_community", fullName: COMMUNITY_REPOSITORY, stars: 30, forks: 4, ownerLogin: "opencirclehq", ownerNickname: "OpenCircle", rank: 0 });
  expect(request.mock.calls[0]).toMatchObject([`https://api.github.com/repos/${COMMUNITY_REPOSITORY}`, { headers: { authorization: "Bearer test-token" }, redirect: "error" }]);
});

it.each([{ private: true }, { fork: true }, { stargazers_count: 4 }])("does not list an ineligible community repository %s", async (fields) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson(githubRepository(fields))));
  expect(await lookupCommunityRepository()).toBeNull();
});

it.each([{ stargazers_count: -1 }, { forks_count: 1.5 }, { node_id: "" }, { owner: null }, { full_name: "another/repository" }, { updated_at: "invalid" }, { full_name: 30 }, { stargazers_count: "30" }, { owner: { login: 30, avatar_url: "https://avatars.githubusercontent.com/u/1" } }, { owner: { login: "opencirclehq", avatar_url: "javascript:invalid" } }])("rejects incomplete or mismatched repository data %s", async (fields) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson(githubRepository(fields))));
  await expect(lookupCommunityRepository()).rejects.toMatchObject({ code: "upstream" });
});

it("removes a deleted repo but preserves failures for the caller to handle", async () => {
  const request = vi.fn().mockResolvedValueOnce(githubJson({}, 404)).mockResolvedValueOnce(githubJson({}, 429));
  vi.stubGlobal("fetch", request);
  expect(await lookupCommunityRepository()).toBeNull();
  await expect(lookupCommunityRepository()).rejects.toMatchObject({ code: "upstream" });
});

it("adds the community repo alongside normal member picks, deduplicates it and preserves member scores", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson(githubRepository())));
  const official = await lookupCommunityRepository();
  const store = new TestStore();
  await store.createMember(memberRecord({ projects: [repository({ stars: 40 })] }));
  const board = await rebuildBoard(store, { communityRepository: official, communityRepositoryCheckedAt: now, communityRepositoryDelayed: false, voteCounts: { "repo:R_community": 1000000 } });
  expect(board.repositories.map((repo) => [repo.id, repo.rank])).toEqual([["R_open-kit", 1], ["R_community", 2]]);
  expect(board.members).toHaveLength(1);
  expect(board.members[0]).toMatchObject({ login: "Octocat", score: 20, upvotes: 0 });
  expect((await rebuildBoard(store)).repositories.map((repo) => repo.id)).toEqual(["R_open-kit", "R_community"]);
  await store.patchMember("octocat", { projects: [repository({ id: "R_community", fullName: COMMUNITY_REPOSITORY, stars: 30 })] });
  expect((await rebuildBoard(store)).repositories.map((repo) => repo.id)).toEqual(["R_community"]);
});

it("loads missing community metadata in the background even when all member data is fresh, caches it and refreshes failures safely", async () => {
  const store = new TestStore();
  await store.setBoard(boardFixture({ communityRepositoryCheckedAt: 0 }));
  const request = vi.fn().mockImplementation(async () => githubJson(githubRepository()));
  vi.stubGlobal("fetch", request);
  async function refresh() {
    const work: Promise<unknown>[] = [];
    const immediate = await readBoard(store, (promise) => work.push(promise));
    await Promise.all(work);
    return { immediate, saved: (await store.getBoard())! };
  }
  const first = await refresh();
  expect(first.immediate.repositories).toEqual([]);
  expect(first.saved.repositories).toMatchObject([{ id: "R_community", stars: 30, rank: 1 }]);
  expect(first.saved.communityRepositoryDelayed).toBe(false);
  await refresh(); expect(request).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + 61000); request.mockRejectedValue(new Error("offline"));
  expect((await refresh()).saved).toMatchObject({ communityRepositoryDelayed: true, communityRepositoryCheckedAt: now + 61000, repositories: [{ id: "R_community", stars: 30 }] });
  await refresh(); expect(request).toHaveBeenCalledTimes(2);
  vi.setSystemTime(now + 122000); request.mockImplementation(async () => githubJson(githubRepository({ stargazers_count: 35 })));
  expect((await refresh()).saved).toMatchObject({ communityRepositoryDelayed: false, repositories: [{ id: "R_community", stars: 35 }] });
  vi.setSystemTime(now + 183000); request.mockImplementation(async () => githubJson({}, 404));
  expect((await refresh()).saved.repositories).toEqual([]);
});
