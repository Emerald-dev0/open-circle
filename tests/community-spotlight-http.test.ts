import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createAppServer } from "../server/node-server";
import { rebuildBoard } from "../server/board";
import { MemoryCommunityStore } from "../server/community-memory";
import { TestStore } from "./helpers/test-store";
import { githubJson, memberRecord } from "./helpers/fixtures";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

it("serves OpenCircle alongside member spotlights and supports votes without adding a developer or awarding owner points", async () => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "");
  const store = new TestStore();
  context.board = store;
  context.community = new MemoryCommunityStore(null);
  await store.createMember(memberRecord());
  await rebuildBoard(store);
  const networkFetch = globalThis.fetch;
  const github = vi.fn(() => Promise.resolve(githubJson({
    node_id: "R_community", name: "open-circle", full_name: "opencirclehq/open-circle", html_url: "https://github.com/opencirclehq/open-circle",
    description: "The OpenCircle community repo", stargazers_count: 30, forks_count: 4, language: "TypeScript", updated_at: "2026-10-16T18:00:00Z", private: false, fork: false,
    owner: { login: "opencirclehq", avatar_url: "https://avatars.githubusercontent.com/u/342771377?v=4" },
  })));
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "https://api.github.com/repos/opencirclehq/open-circle") return github();
    if (!String(input).startsWith("http://127.0.0.1:")) throw new Error("Unexpected external request");
    return networkFetch(input, init);
  });
  server = createAppServer();
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing HTTP port");
  const base = `http://127.0.0.1:${address.port}`;
  expect((await fetch(`${base}/api/board`)).status).toBe(200);
  await vi.waitFor(async () => expect((await store.getBoard())?.repositories.map((repo) => repo.id)).toEqual(["R_community", "R_open-kit"]));
  const snapshot = await (await fetch(`${base}/api/board`)).json();
  expect(snapshot.repositories[0]).toMatchObject({ fullName: "opencirclehq/open-circle", ownerLogin: "opencirclehq", ownerNickname: "OpenCircle", stars: 30, forks: 4 });
  expect(snapshot.members).toHaveLength(1);
  expect(github).toHaveBeenCalledTimes(1);
  const community = await fetch(`${base}/api/community`);
  const cookie = community.headers.get("set-cookie")!.split(";", 1)[0];
  const vote = await fetch(`${base}/api/vote`, { method: "POST", headers: { origin: base, cookie, "content-type": "application/json" }, body: JSON.stringify({ target: "repo:R_community", active: true }) });
  expect(vote.status).toBe(200);
  expect(await vote.json()).toMatchObject({ target: "repo:R_community", active: true, count: 1 });
  expect((await store.getBoard())?.repositories.map((repo) => repo.id)).toEqual(["R_community", "R_open-kit"]);
  expect((await store.getBoard())?.members[0]).toMatchObject({ score: 20, upvotes: 0 });
});
