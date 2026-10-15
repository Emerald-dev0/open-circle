import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as communityApi } from "../api/community";
import { POST as voteApi } from "../api/vote";
import { POST as signOutApi } from "../api/auth";
import { MemoryCommunityStore } from "../server/community-memory";
import { profileActor } from "../server/github-auth";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let store: MemoryCommunityStore;
const profile = { id: 1, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" };

function request(body?: unknown, token = "a".repeat(64), path = "vote") {
  return new Request(`https://opencircle.test/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie: `opencircle_github=${token}`, origin: "https://opencircle.test", "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.8" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(async () => {
  store = new MemoryCommunityStore(null);
  context.community = store;
  context.board = new TestStore();
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "https://opencircle.test/api/auth-callback");
  for (const token of ["a".repeat(64), "b".repeat(64)]) await store.createSession(createHash("sha256").update(token).digest("hex"), profile, Date.now() + 60_000);
});
afterEach(() => vi.unstubAllEnvs());

describe("One tool vote per signed-in GitHub profile", () => {
  it("shares the same vote across browser sessions, supports switching and repeated removal", async () => {
    const target = "tool:devdocs";
    for (const token of ["a".repeat(64), "b".repeat(64), "a".repeat(64)]) {
      const response = await voteApi(request({ target, value: 1 }, token));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ target, value: 1, count: 1 });
    }
    expect(await (await voteApi(request({ target, value: -1 }, "b".repeat(64)))).json()).toEqual({ target, value: -1, count: -1 });
    const state = await (await communityApi(request(undefined, "a".repeat(64), "community"))).json();
    expect(state.toolVotes[target]).toBe(-1);
    expect(state.profile.login).toBe("octocat");
    for (let i = 0; i < 2; i++) expect(await (await voteApi(request({ target, value: 0 }))).json()).toEqual({ target, value: 0, count: 0 });
  });

  it("rejects anonymous and forged identities, invalid directions and unapproved tools", async () => {
    expect((await voteApi(request({ target: "tool:devdocs", value: 1, github: "octocat" }, "c".repeat(64)))).status).toBe(401);
    for (const value of [2, -2, true, "1", null]) expect((await voteApi(request({ target: "tool:devdocs", value }))).status).toBe(400);
    expect((await voteApi(request({ target: "tool:devdocs", active: true }))).status).toBe(400);
    await store.createTool({ id: "pending", name: "Pending", url: "https://pending.example/", description: "A pending tool.", category: "Design", source: "community", status: "pending", createdAt: 1 });
    expect((await voteApi(request({ target: "tool:pending", value: 1 }))).status).toBe(404);
    expect((await store.readProfileVotes(null)).counts).toEqual({});
  });

  it("isolates different accounts and keeps anonymous legacy tool votes out of profile scores", async () => {
    const second = { ...profile, id: 2, login: "another" };
    const token = "d".repeat(64);
    await store.createSession(createHash("sha256").update(token).digest("hex"), second, Date.now() + 60_000);
    await store.setVote("tool:devdocs", "old-browser-voter", true);
    await voteApi(request({ target: "tool:devdocs", value: -1 }));
    await voteApi(request({ target: "tool:devdocs", value: 1 }, token));
    const state = await (await communityApi(request(undefined, token, "community"))).json();
    expect(state.counts["tool:devdocs"]).toBe(0);
    expect(state.toolVotes["tool:devdocs"]).toBe(1);
    expect((await store.readProfileVotes(profileActor(profile))).votes["tool:devdocs"]).toBe(-1);
    expect(state.voted).not.toContain("tool:devdocs");
  });

  it("revokes the session on logout and prevents later writes with its cookie", async () => {
    const response = await signOutApi(request({}, "a".repeat(64), "auth"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await voteApi(request({ target: "tool:devdocs", value: 1 }))).status).toBe(401);
  });
});
