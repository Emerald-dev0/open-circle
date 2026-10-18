import type { Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createAppServer } from "../server/node-server";
import { MemoryCommunityStore } from "../server/community-memory";
import { TestStore } from "./helpers/test-store";
import { githubJson, githubOwner } from "./helpers/fixtures";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));
vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

it("ranks stars given directly on GitHub through preview, registration and cached public HTTP, then removes unstarred credit", async () => {
  const now = Date.parse("2026-10-16T15:00:00Z");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", "");
  const board = new TestStore();
  context.board = board;
  context.community = new MemoryCommunityStore(null);
  const networkFetch = globalThis.fetch;
  let starred = true;
  const graphql = vi.fn((init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body));
    expect(query).not.toContain("mutation");
    const edge = (id: string, login: string) => ({ starredAt: new Date(now - 1000).toISOString(), node: { id, isPrivate: false, isFork: false, owner: { __typename: "User", login } } });
    const data = Object.fromEntries(Object.entries(variables).filter(([key]) => /^l\d+$/.test(key)).map(([key, login]) => [key.replace("l", "u"), githubOwner({
      login: String(login)[0].toUpperCase() + String(login).slice(1).toLowerCase(),
      followers: { totalCount: String(login).toLowerCase() === "popular" ? 1000000 : 2 },
      starredRepositories: { isOverLimit: false, edges: String(login).toLowerCase() === "helper" && starred ? [edge("R_peer", "Peer"), edge("R_peer2", "Peer"), edge("R_self", "Helper"), edge("R_outside", "Outside")] : [], pageInfo: { hasNextPage: false, endCursor: null } },
    })]));
    return Promise.resolve(githubJson({ data }));
  });
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "https://api.github.com/graphql") return graphql(init);
    if (!String(input).startsWith("http://127.0.0.1:")) throw new Error("Unexpected external request");
    return networkFetch(input, init);
  });
  server = createAppServer();
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing HTTP port");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => fetch(`${base}/api/${route}`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(body) });
  for (const [github, whatsapp] of [["Peer", "+447700900111"], ["Popular", "+447700900222"]]) {
    expect((await post("register", { github, nickname: github, whatsapp })).status).toBe(200);
  }
  const details = { github: "Helper", nickname: "Helper", whatsapp: "+447700900333" };
  const preview = await post("preview", details);
  expect(preview.status).toBe(200);
  expect(await preview.json()).toMatchObject({ score: 40, helperPoints: 20 });
  const registration = await post("register", details);
  expect(registration.status).toBe(200);
  const registered = await registration.json();
  expect(registered.board.members[0]).toMatchObject({ login: "Helper", rank: 1, score: 40, starHelps: 1 });
  const calls = graphql.mock.calls.length;
  const saved = await (await fetch(`${base}/api/board`)).json();
  expect(saved.members[0]).toMatchObject({ login: "Helper", score: 40, starHelps: 1 });
  expect(graphql).toHaveBeenCalledTimes(calls);
  expect(JSON.stringify(saved)).not.toMatch(/starredRepositories|ownerLogin.*Outside|447700900/);
  starred = false;
  vi.setSystemTime(now + 61000);
  await fetch(`${base}/api/board`);
  await vi.waitFor(async () => expect((await board.getMember("helper"))?.starSupportUpdatedAt).toBe(now + 61000));
  await vi.waitFor(async () => expect((await board.getBoard())?.members.find((member) => member.login.toLowerCase() === "helper")?.starHelps).toBe(0));
  const updated = await (await fetch(`${base}/api/board`)).json();
  expect(updated.members[0].login).toBe("Popular");
  expect(updated.members.find((member: { login: string }) => member.login.toLowerCase() === "helper")).toMatchObject({ score: 20, helperPoints: 0, starHelps: 0 });
});
