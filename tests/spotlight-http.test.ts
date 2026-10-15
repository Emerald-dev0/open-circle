import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createAppServer } from "../server/node-server";
import { MemoryCommunityStore } from "../server/community-memory";
import { githubJson, githubOwner, githubRepository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([undefined, "R_5"])("serves the complete spotlight onboarding and voting flow over HTTP with selection %s", async (spotlightRepositoryId) => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  const board = new TestStore();
  context.board = board;
  context.community = new MemoryCommunityStore(null);
  const networkFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "https://api.github.com/graphql") {
      return Promise.resolve(githubJson({ data: { u0: githubOwner({ repositories: {
        totalCount: 3, nodes: [githubRepository(20), githubRepository(5), githubRepository(4)],
        pageInfo: { hasNextPage: false, endCursor: null },
      } }) } }));
    }
    return networkFetch(input, init);
  }));
  server = createAppServer();
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing HTTP port");
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = "";
  const post = (route: string, body: unknown) => fetch(`${base}/api/${route}`, {
    method: "POST", headers: { origin: base, "content-type": "application/json", cookie }, body: JSON.stringify(body),
  });
  const details = { github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" };

  const preview = await post("preview", details);
  expect(preview.status).toBe(200);
  expect((await preview.json()).profile.projects.map((repo: { id: string }) => repo.id)).toEqual(["R_20", "R_5"]);
  expect(await board.listMembers()).toEqual([]);
  const invalid = await post("register", { ...details, spotlightRepositoryId: "R_4" });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("invalid_spotlight");
  const registration = await post("register", { ...details, spotlightRepositoryId });
  expect(registration.status).toBe(200);
  const result = await registration.json();
  const expectedId = spotlightRepositoryId ?? "R_20";
  expect(result.board.repositories.map((repo: { id: string }) => repo.id)).toEqual([expectedId]);
  expect(JSON.stringify(result)).not.toContain("8031234567");
  const snapshot = await (await fetch(`${base}/api/board`)).json();
  expect(snapshot.repositories.map((repo: { id: string }) => repo.id)).toEqual([expectedId]);

  const community = await fetch(`${base}/api/community`);
  expect(community.status).toBe(200);
  cookie = community.headers.get("set-cookie")!.split(";", 1)[0];
  expect((await post("vote", { target: "repo:R_4", active: true })).status).toBe(404);
  const vote = await post("vote", { target: `repo:${expectedId}`, active: true });
  expect(vote.status).toBe(200);
  expect((await board.getBoard())?.members[0].upvotes).toBe(1);
  expect((await board.getBoard())?.repositories.map((repo) => repo.id)).toEqual([expectedId]);
});
