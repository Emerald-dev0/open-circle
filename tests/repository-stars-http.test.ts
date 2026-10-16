import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAppServer } from "../server/node-server";
import { MemoryCommunityStore } from "../server/community-memory";
import { rebuildBoard } from "../server/board";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";
import { sessionHash } from "../server/github-auth";
import { openStarAuthorization } from "../server/github-star-authorization";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));

let server: Server;
let base: string;
let community: MemoryCommunityStore;
let board: TestStore;
let cookie: string;
let starred: boolean;
let privateRepo: boolean;
let upstream: ReturnType<typeof vi.fn>;
let failure: Response | undefined;
let scope: string;
const nativeFetch = globalThis.fetch;
let repoId = "R_open-kit";
const token = "test-github-star-token";

async function call(path: string, body?: unknown, extra: Record<string, string> = {}) {
  return nativeFetch(`${base}/api/${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "manual",
    headers: { cookie, origin: base, "content-type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function connect() {
  const start = await call("auth-start?returnTo=%2Frepositories&stars=1");
  const destination = new URL(start.headers.get("location")!);
  expect(destination.searchParams.get("scope")).toBe("public_repo");
  cookie = start.headers.getSetCookie()[0].split(";", 1)[0];
  const callback = await call(`auth-callback?state=${destination.searchParams.get("state")}&code=test-code`);
  const session = callback.headers.getSetCookie().find((item) => item.startsWith("opencircle_github="));
  if (session) cookie = session.split(";", 1)[0];
  return callback;
}

beforeEach(async () => {
  repoId = "R_open-kit";
  board = new TestStore();
  community = new MemoryCommunityStore(null);
  context.board = board;
  context.community = community;
  await board.createMember(memberRecord());
  await rebuildBoard(board);
  server = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", `${base}/api/auth-callback`);
  cookie = "";
  starred = false;
  privateRepo = false;
  failure = undefined;
  scope = "public_repo";
  upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: token, token_type: "bearer", scope });
    if (url === "https://api.github.com/user") return Response.json({ id: 1, login: "octocat", type: "User" });
    if (url !== "https://api.github.com/graphql") throw new Error(`Unexpected upstream ${url}`);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    if (failure) return failure.clone();
    const { query, variables } = JSON.parse(String(init?.body));
    const mutation = query.startsWith("mutation");
    if (mutation) starred = query.includes("addStar");
    const node = { id: repoId, isPrivate: privateRepo, viewerHasStarred: starred, stargazerCount: starred ? 11 : 10 };
    return Response.json({ data: mutation ? { [starred ? "addStar" : "removeStar"]: { starrable: node } } : { nodes: variables.ids.map(() => node) } });
  });
  vi.stubGlobal("fetch", upstream);
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("connects explicitly, keeps tokens encrypted and private, stars idempotently, removes stars and signs out over HTTP", async () => {
  expect((await call("repository-stars?id=R_open-kit")).headers.get("cache-control")).toBe("private, no-store");
  expect(await (await call("repository-stars?id=R_open-kit")).json()).toEqual({ connected: false, repositories: [] });
  const callback = await connect();
  expect(callback.headers.get("location")).toBe("/repositories");
  expect(starred).toBe(false);
  const hash = sessionHash(new Request(base, { headers: { cookie } }))!;
  const stored = await community.readSession(hash);
  expect(stored?.starAuthorization).toBeTruthy();
  expect(JSON.stringify(stored)).not.toContain(token);
  expect(openStarAuthorization(stored?.starAuthorization, hash, 1)).toBe(token);
  const publicProfile = await (await call("community")).json();
  expect(publicProfile.profile.starsConnected).toBe(true);
  expect(JSON.stringify(publicProfile)).not.toContain("starAuthorization");
  expect(JSON.stringify(publicProfile)).not.toContain(token);
  expect(callback.headers.getSetCookie().join(" ")).not.toContain(token);
  const before = await (await call(`repository-stars?id=${repoId}`)).json();
  expect(before).toEqual({ connected: true, repositories: [{ id: repoId, stars: 10, starred: false }] });
  const star = await call("repository-stars", { repositoryId: repoId, active: true });
  expect(star.status).toBe(200);
  expect(await star.json()).toEqual({ id: repoId, stars: 11, starred: true });
  const mutations = () => upstream.mock.calls.filter(([, init]) => String(init?.body).includes("mutation("));
  expect(mutations()).toHaveLength(1);
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(200);
  expect(mutations()).toHaveLength(1);
  expect((await (await call(`repository-stars?id=${repoId}`)).json()).repositories[0].starred).toBe(true);
  expect(await (await call("repository-stars", { repositoryId: repoId, active: false })).json()).toEqual({ id: repoId, stars: 10, starred: false });
  expect((await community.readVotes("")).counts).toEqual({});
  expect((await call("auth", {})).status).toBe(200);
  expect(await community.readSession(hash)).toBeNull();
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(401);
});

it("requires user consent, validates targets and blocks cross-origin writes before GitHub", async () => {
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(401);
  await connect();
  upstream.mockClear();
  expect((await call("repository-stars", { repositoryId: repoId, active: true }, { origin: "https://attacker.test" })).status).toBe(403);
  expect((await call("repository-stars", { repositoryId: "not-listed", active: true })).status).toBe(404);
  expect((await call("repository-stars?id=not-listed")).status).toBe(404);
  expect((await call("repository-stars", { repositoryId: repoId, active: "true" })).status).toBe(400);
  expect((await call(`repository-stars?${Array.from({ length: 21 }, (_, id) => `id=R_${id}`).join("&")}`)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
  privateRepo = true;
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(404);
  expect(starred).toBe(false);
});

it("stars the listed OpenCircle organization repository through the same user-authorized flow", async () => {
  repoId = "R_kgDOVJ7oBg";
  const current = (await board.getBoard())!;
  await board.setBoard({ ...current, communityRepositoryCheckedAt: Date.now(), repositories: [{ ...current.repositories[0], id: repoId, name: "open-circle", fullName: "opencirclehq/open-circle", ownerLogin: "opencirclehq", ownerNickname: "OpenCircle", url: "https://github.com/opencirclehq/open-circle" }, ...current.repositories] });
  await connect();
  const response = await call("repository-stars", { repositoryId: repoId, active: true });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: repoId, starred: true, stars: 11 });
  expect((await board.listMembers()).map((member) => member.login)).toEqual(["octocat"]);
  expect((await community.readVotes("")).counts).toEqual({});
});

it("retains the user's requested destination when permission is declined", async () => {
  scope = "";
  const callback = await connect();
  expect(callback.headers.get("location")).toBe("/repositories?signin=github_stars_permission");
  expect(callback.headers.getSetCookie().some((item) => item.startsWith("opencircle_github="))).toBe(false);
  expect(starred).toBe(false);
});

it.each([401, 403, 429, 502])("reports GitHub status %s without showing a successful star", async (status) => {
  await connect();
  failure = new Response("provider failure", { status });
  const response = await call("repository-stars", { repositoryId: repoId, active: true });
  expect(response.status).toBe(status === 401 ? 403 : status);
  expect(JSON.stringify(await response.json())).not.toContain(token);
  expect(starred).toBe(false);
});

it("binds encrypted authorization to the session, user and current application secret", async () => {
  await connect();
  const hash = sessionHash(new Request(base, { headers: { cookie } }))!;
  const session = await community.readSession(hash);
  expect(openStarAuthorization(session?.starAuthorization, "another-session", 1)).toBeNull();
  expect(openStarAuthorization(session?.starAuthorization, hash, 2)).toBeNull();
  expect(openStarAuthorization(`${session?.starAuthorization}x`, hash, 1)).toBeNull();
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "rotated-secret");
  expect(await (await call(`repository-stars?id=${repoId}`)).json()).toEqual({ connected: false, repositories: [] });
});

it("limits star writes by account and requires a new connection for old or expired sessions", async () => {
  cookie = `opencircle_github=${"b".repeat(64)}`;
  const hash = sessionHash(new Request(base, { headers: { cookie } }))!;
  await community.createSession(hash, { id: 1, login: "octocat", avatarUrl: "" }, Date.now() + 60_000);
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(403);
  await connect();
  for (let count = 0; count < 30; count++) {
    expect((await call("repository-stars", { repositoryId: repoId, active: false })).status).toBe(200);
  }
  const limited = await call("repository-stars", { repositoryId: repoId, active: true });
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  const currentHash = sessionHash(new Request(base, { headers: { cookie } }))!;
  await community.createSession(currentHash, { id: 1, login: "octocat", avatarUrl: "" }, Date.now() - 1);
  expect((await call("repository-stars", { repositoryId: repoId, active: true })).status).toBe(401);
});
