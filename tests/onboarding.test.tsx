import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { RankMe } from "../src/components/board/rank-me";
import Index from "../src/pages/Index";
import { BOARD_KEY, useBoard } from "../src/hooks/use-board";
import { readMe } from "../src/lib/identity";
import { previewProfile, readBoard, rebuildBoard, register } from "../server/board";
import { handle, json } from "../server/http";
import type { Board } from "../shared/types";
import { boardFixture, githubJson, githubOwner, memberRecord, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";
import packageJson from "../package.json";

const clients: QueryClient[] = [];

function clientFor(board?: Board) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  if (board) client.setQueryData(BOARD_KEY, board);
  clients.push(client);
  return client;
}

function networkFor(store: TestStore) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/board") return handle(async () => json(await readBoard(store)));
    if (url.startsWith("/api/preview?")) return handle(async () => json(await previewProfile(store, new URL(url, "http://local.test").searchParams.get("u") ?? "")));
    if (url === "/api/register") return handle(async () => json(await register(store, JSON.parse(String(init?.body)))));
    if (url === "https://api.github.com/graphql") {
      const { variables } = JSON.parse(String(init?.body));
      const data = Object.fromEntries(Object.entries(variables)
        .filter(([key]) => /^l\d+$/.test(key))
        .map(([key, login]) => [key.replace("l", "u"), login === "missing" ? null : githubOwner({ login: "Octocat" })]));
      return githubJson({ data });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Providers({ client, children, path = "/" }: { client: QueryClient; children: React.ReactNode; path?: string }) {
  return <QueryClientProvider client={client}><MotionConfig reducedMotion="always"><TooltipProvider><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></TooltipProvider></MotionConfig></QueryClientProvider>;
}

function RankHarness({ onLocate = vi.fn(), onJoined = vi.fn() }: { onLocate?: (login: string) => void; onJoined?: (login: string) => void }) {
  const { data: board } = useBoard();
  const [me, setMe] = useState<string | null>(null);
  return <RankMe board={board} me={me} onLocate={onLocate} onJoined={(login) => { setMe(login.toLowerCase()); onJoined(login); }} onRules={() => {}} />;
}

function LocationMarker() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

async function previewOctocat(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole("textbox", { name: /GitHub profile link or username/i });
  await user.type(input, "Octocat");
  await user.click(within(input.closest("form")!).getByRole("button", { name: "Rank me" }));
  return screen.findByRole("textbox", { name: "Nickname" });
}

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe("Username-first community onboarding", () => {
  it("asks for GitHub first, then nickname and WhatsApp, and updates the board cache with the joined row", async () => {
    const store = new TestStore();
    const initial = await rebuildBoard(store);
    const fetchMock = networkFor(store);
    const client = clientFor(initial);
    const onJoined = vi.fn();
    render(<Providers client={client}><RankHarness onJoined={onJoined} /></Providers>);
    const user = userEvent.setup();

    expect(screen.queryByRole("textbox", { name: "Nickname" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /WhatsApp number used/i })).toBeNull();
    const nickname = await previewOctocat(user);
    expect(await store.listMembers()).toEqual([]);
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "0803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    await screen.findByText("You're in.");
    expect(onJoined).toHaveBeenCalledWith("Octocat");
    expect(readMe()).toBe("octocat");
    expect(client.getQueryData<Board>(BOARD_KEY)?.members).toMatchObject([{ login: "Octocat", nickname: "Octo", rank: 1 }]);
    const request = fetchMock.mock.calls.find(([url]) => url === "/api/register");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" });

    fetchMock.mockImplementationOnce(async () => githubJson(initial));
    await act(async () => { await client.invalidateQueries({ queryKey: BOARD_KEY }); });
    expect(client.getQueryData<Board>(BOARD_KEY)?.members[0].login).toBe("Octocat");
    expect(screen.getByText("You're in.")).toBeTruthy();
  });

  it("validates nickname and phone before sending registration, while preserving entered details", async () => {
    const store = new TestStore();
    const fetchMock = networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    const nickname = await previewOctocat(user);
    await user.clear(nickname);
    await user.type(nickname, "O");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    expect((await screen.findByRole("alert")).textContent).toContain("at least 2");
    await user.type(nickname, "cto");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "bad-number");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Digits only");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/register")).toHaveLength(0);
    expect((nickname as HTMLInputElement).value).toBe("Octo");
  });

  it("locates an existing member without another GitHub request or collecting private details", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord());
    const fetchMock = networkFor(store);
    const onLocate = vi.fn();
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness onLocate={onLocate} /></Providers>);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: /GitHub profile link or username/i }), "@OCTOCAT");
    await user.click(screen.getByRole("button", { name: "Rank me" }));

    await screen.findByText("Octo is already on the board.");
    expect(onLocate).toHaveBeenCalledWith("Octocat");
    expect(screen.queryByRole("textbox", { name: "Nickname" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a missing GitHub profile error before revealing registration fields", async () => {
    const store = new TestStore();
    networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: /GitHub profile link or username/i }), "missing");
    await user.click(screen.getByRole("button", { name: "Rank me" }));

    expect((await screen.findByRole("alert")).textContent).toContain("no GitHub user called missing");
    expect(screen.queryByRole("textbox", { name: "Nickname" })).toBeNull();
    expect(await store.listMembers()).toEqual([]);
  });

  it("shows a registration conflict without losing the nickname and phone", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord({ login: "another", displayLogin: "Another", nickname: "Existing", projects: [] }));
    networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    const nickname = await previewOctocat(user);
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    const phone = screen.getByRole("textbox", { name: /WhatsApp number used/i });
    await user.type(phone, "0803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    expect((await screen.findByRole("alert")).textContent).toContain("already registered to another member");
    expect((nickname as HTMLInputElement).value).toBe("Octo");
    expect((phone as HTMLInputElement).value).toBe("0803 123 4567");
    expect(readMe()).toBeNull();
  });
});

describe("Community leaderboard pages", () => {
  it("switches to the repositories route, shows ranked projects, and keeps registration details while using the tabs", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord({ login: "another", displayLogin: "Another", nickname: "Existing", whatsapp: "+2348031234568", projects: [repository({ fullName: "Another/open-kit" })] }));
    const board = await rebuildBoard(store);
    networkFor(store);
    render(<Providers client={clientFor(board)}><Index /><LocationMarker /></Providers>);
    const user = userEvent.setup();
    const nickname = await previewOctocat(user);
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "0803 123 4567");
    await user.click(screen.getByRole("tab", { name: /Repositories/ }));

    expect(screen.getByRole("status", { name: "Current path" }).textContent).toBe("/repositories");
    const table = screen.getByRole("table", { name: "Repositories ranked by stars" });
    expect(within(table).getByRole("link", { name: /open-kit/ }).getAttribute("href")).toBe("https://github.com/Octocat/open-kit");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect((screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement).value).toBe("Octo");
    expect((screen.getByRole("textbox", { name: /WhatsApp number used/i }) as HTMLInputElement).value).toBe("0803 123 4567");
    await user.click(screen.getByRole("tab", { name: /Developers/ }));
    expect(screen.getByRole("list", { name: "Top three" })).toBeTruthy();
  });

  it("joins from the repository view and reveals a member placed past the table's first 50 rows", async () => {
    const store = new TestStore();
    for (let i = 1; i <= 54; i += 1) {
      await store.createMember(memberRecord({ login: `member-${i}`, displayLogin: `member-${i}`, nickname: `Member ${i}`, whatsapp: `+44770090${String(i).padStart(4, "0")}`, stars: 1000 - i, projects: [] }));
    }
    const client = clientFor(await rebuildBoard(store));
    networkFor(store);
    render(<Providers client={client} path="/repositories"><Index /><LocationMarker /></Providers>);
    const user = userEvent.setup();
    const nickname = await previewOctocat(user);
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "0803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    await screen.findByText("You're in.");
    expect(screen.getByRole("status", { name: "Current path" }).textContent).toBe("/");
    await waitFor(() => expect(document.getElementById("member-octocat")).toBeTruthy());
    const row = document.getElementById("member-octocat")!;
    expect(within(row).getByText("55")).toBeTruthy();
    expect(within(row).getByText("Octo")).toBeTruthy();
    expect(within(row).getByText("You")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show all .*members/ })).toBeNull();
    expect(client.getQueryData<Board>(BOARD_KEY)?.members.at(-1)).toMatchObject({ login: "Octocat", rank: 55 });
  });

  it("supports a direct repositories link and an honest empty state", async () => {
    const board = boardFixture();
    render(<Providers client={clientFor(board)} path="/repositories"><Index /></Providers>);

    expect(screen.getByRole("tab", { name: /Repositories/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("No repositories yet.")).toBeTruthy();
    expect(screen.getByText(`OpenCircle v${packageJson.version}`)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Repositories ranked by stars" })).toBeNull();
  });
});
