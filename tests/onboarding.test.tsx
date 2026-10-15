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
import { readMe, writeMe } from "../src/lib/identity";
import { previewProfile, readBoard, rebuildBoard, register } from "../server/board";
import { handle, HttpError, json } from "../server/http";
import { requireWhatsappMembership } from "../server/whatsapp";
import type { Board } from "../shared/types";
import { boardFixture, githubJson, githubOwner, memberRecord, publicMember, repository } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";
import packageJson from "../package.json";

vi.mock("../server/whatsapp", () => ({ requireWhatsappMembership: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => ({ readVotes: async () => ({ counts: {}, voted: [] }) }) }));

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
    if (url === "/api/preview") {
      const body = JSON.parse(String(init?.body));
      return handle(async () => json(await previewProfile(store, body.github, body.whatsapp)));
    }
    if (url === "/api/register") return handle(async () => json(await register(store, JSON.parse(String(init?.body)))));
    if (url === "/api/community") return new Response(JSON.stringify({ tools: [], counts: {}, voted: [] }), { status: 200, headers: { "content-type": "application/json" } });
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

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.mocked(requireWhatsappMembership).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/community") return new Response(JSON.stringify({ tools: [], counts: {}, voted: [] }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe("Username-first community onboarding", () => {
  it.each(["@Octocat", "https://github.com/Octocat/"])("previews the real GitHub photo for %s before collecting private details", async (github) => {
    vi.spyOn(window, "Image").mockImplementation(() => {
      const image = document.createElement("img");
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 160 } });
      return image;
    });
    const store = new TestStore();
    const fetchMock = networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: /GitHub profile link or username/i });
    await user.click(input);
    await user.paste(github);

    const avatar = await screen.findByRole("img", { name: "GitHub profile photo for Octocat" });
    expect(avatar.getAttribute("src")).toBe("https://github.com/Octocat.png?size=160");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Nickname" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Rank me" }));
    await screen.findByRole("textbox", { name: "Nickname" });
    expect(screen.getAllByRole("img", { name: "GitHub profile photo for Octocat" })).toHaveLength(2);

    await user.clear(input);
    await waitFor(() => expect(screen.queryByRole("img", { name: "GitHub profile photo for Octocat" })).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps registration usable when a profile photo fails to load", async () => {
    vi.spyOn(window, "Image").mockImplementation(() => {
      const image = document.createElement("img");
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });
      return image;
    });
    const store = new TestStore();
    networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await previewOctocat(user);
    expect(screen.queryByRole("img", { name: "GitHub profile photo for Octocat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Join the board" })).toBeTruthy();
    expect(screen.getByText("OC")).toBeTruthy();
  });

  it("asks a nonmember to join with their number and rechecks before registering", async () => {
    const store = new TestStore();
    const fetchMock = networkFor(store);
    const membership = vi.mocked(requireWhatsappMembership).mockRejectedValueOnce(
      new HttpError(403, "whatsapp_not_member", "Join with the same number, then check again.", "whatsapp"),
    );
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await previewOctocat(user);
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    const link = await screen.findByRole("link", { name: "Join the WhatsApp group" });
    expect(link.getAttribute("href")).toContain("chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q");
    expect(screen.getByText(/Join using \+2348031234567/)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "https://api.github.com/graphql")).toBe(false);
    expect(await store.listMembers()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Check again" }));
    await screen.findByText("You're in.");
    expect(membership).toHaveBeenCalledTimes(2);
    expect(await store.listMembers()).toHaveLength(1);
  });

  it("keeps registration blocked when the bot is unavailable", async () => {
    const store = new TestStore();
    const fetchMock = networkFor(store);
    vi.mocked(requireWhatsappMembership).mockRejectedValue(new HttpError(503, "whatsapp_unavailable", "We can't check the WhatsApp group right now. Try again shortly.", "whatsapp"));
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await previewOctocat(user);
    const phone = screen.getByRole("textbox", { name: /WhatsApp number used/i });
    await user.type(phone, "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    expect((await screen.findByRole("alert")).textContent).toContain("can't check");
    expect((phone as HTMLInputElement).value).toBe("+234 803 123 4567");
    expect(screen.queryByRole("link", { name: "Join the WhatsApp group" })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "https://api.github.com/graphql")).toBe(false);
    expect(await store.listMembers()).toEqual([]);
  });

  it("honors a paused group invite and clears the join prompt when the phone changes", async () => {
    const store = new TestStore();
    await store.setConfig({ invite: { url: "https://chat.whatsapp.com/paused", open: false, note: "Ask the organiser to add you." }, weights: boardFixture().weights });
    networkFor(store);
    vi.mocked(requireWhatsappMembership).mockRejectedValue(new HttpError(403, "whatsapp_not_member", "Join with the same number, then check again.", "whatsapp"));
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await previewOctocat(user);
    const phone = screen.getByRole("textbox", { name: /WhatsApp number used/i });
    await user.type(phone, "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    await screen.findByText("Ask the organiser to add you.");
    expect(screen.queryByRole("link", { name: "Join the WhatsApp group" })).toBeNull();
    await user.clear(phone);
    expect(screen.queryByText("Ask the organiser to add you.")).toBeNull();
    expect(screen.getByRole("button", { name: "Join the board" })).toBeTruthy();
  });

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
    expect(fetchMock).not.toHaveBeenCalled();
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    await screen.findByText("You're in.");
    expect(onJoined).toHaveBeenCalledWith("Octocat");
    expect(readMe()).toBe("octocat");
    expect(client.getQueryData<Board>(BOARD_KEY)?.members).toMatchObject([{ login: "Octocat", nickname: "Octo", rank: 1 }]);
    expect(client.getQueryData<Board>(BOARD_KEY)?.members[0].avatarUrl).toBe("https://avatars.githubusercontent.com/u/1");
    const request = fetchMock.mock.calls.find(([url]) => url === "/api/register");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ github: "Octocat", nickname: "Octo", whatsapp: "+2348031234567" });

    fetchMock.mockImplementationOnce(async () => githubJson(initial));
    await act(async () => { await client.invalidateQueries({ queryKey: BOARD_KEY }); });
    expect(client.getQueryData<Board>(BOARD_KEY)?.members[0].login).toBe("Octocat");
    expect(screen.getByText("You're in.")).toBeTruthy();
  });

  it("shows a sample number and requires a country code before registration", async () => {
    const store = new TestStore();
    const fetchMock = networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await previewOctocat(user);
    const phone = screen.getByRole("textbox", { name: /WhatsApp number used/i });
    expect(phone.getAttribute("placeholder")).toBe("e.g. +234 803 123 4567");
    expect(screen.getByText(/Use your WhatsApp group number with its country code/)).toBeTruthy();

    await user.type(phone, "0803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    expect((await screen.findByRole("alert")).textContent).toContain("country code");
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await store.listMembers()).toEqual([]);

    await user.clear(phone);
    await user.type(phone, "+234 803 123 4567");
    expect(phone.hasAttribute("aria-invalid")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Join the board" }));
    await screen.findByText("You're in.");
    expect(await store.getMember("octocat")).toMatchObject({ whatsapp: "+2348031234567" });
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
    expect((await screen.findByRole("alert")).textContent).toContain("country code");
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

  it("collects the group number before checking a missing GitHub profile", async () => {
    const store = new TestStore();
    networkFor(store);
    render(<Providers client={clientFor(await rebuildBoard(store))}><RankHarness /></Providers>);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: /GitHub profile link or username/i }), "missing");
    await user.click(screen.getByRole("button", { name: "Rank me" }));
    await user.type(await screen.findByRole("textbox", { name: /WhatsApp number used/i }), "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    expect((await screen.findByRole("alert")).textContent).toContain("no GitHub user called missing");
    expect((screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement).value).toBe("missing");
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
    await user.type(phone, "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    expect((await screen.findByRole("alert")).textContent).toContain("already registered to another member");
    expect((nickname as HTMLInputElement).value).toBe("Octo");
    expect((phone as HTMLInputElement).value).toBe("+234 803 123 4567");
    expect(readMe()).toBeNull();
  });
});

describe("Community leaderboard pages", () => {
  it("keeps the introductory heading when a visitor looks up someone already on the board", async () => {
    render(<Providers client={clientFor(boardFixture({ members: [publicMember()] }))}><Index /></Providers>);
    const user = userEvent.setup();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Paste your username.Take your place.");

    const input = screen.getByRole("textbox", { name: /GitHub profile link or username/i });
    await user.type(input, "Octocat");
    await user.click(within(input.closest("form")!).getByRole("button", { name: "Rank me" }));

    await screen.findByText("Octo is already on the board.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Paste your username.Take your place.");
    expect(readMe()).toBeNull();
  });

  it("restores a remembered member's heading, follows rank updates, and handles a removed member", async () => {
    writeMe("OCTOCAT");
    const board = boardFixture({ members: [publicMember()] });
    const client = clientFor(board);
    render(<Providers client={client}><Index /></Providers>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're on the board.Ranked #1.");

    await act(async () => {
      client.setQueryData(BOARD_KEY, {
        ...board,
        members: [
          publicMember({ login: "another", nickname: "Another", rank: 1 }),
          publicMember({ rank: 2 }),
        ],
        updatedAt: board.updatedAt + 1,
      });
    });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're on the board.Ranked #2."));

    await act(async () => {
      client.setQueryData(BOARD_KEY, { ...board, members: [], updatedAt: board.updatedAt + 2 });
    });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Paste your username.Take your place."));
  });

  it("switches to the repositories route, shows ranked projects, and keeps registration details while using the tabs", async () => {
    const store = new TestStore();
    await store.createMember(memberRecord({ login: "another", displayLogin: "Another", nickname: "Existing", whatsapp: "+2348031234568", projects: [repository({ fullName: "Another/open-kit" })] }));
    const board = await rebuildBoard(store);
    networkFor(store);
    render(<Providers client={clientFor(board)}><Index /><LocationMarker /></Providers>);
    const user = userEvent.setup();
    const nickname = await previewOctocat(user);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Paste your username.Take your place.");
    await user.clear(nickname);
    await user.type(nickname, "Octo");
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "+234 803 123 4567");
    await user.click(screen.getByRole("tab", { name: /Repositories/ }));

    expect(screen.getByRole("status", { name: "Current path" }).textContent).toBe("/repositories");
    expect(screen.getByText("Public projects from members, ranked by stars.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Repositories" }).getAttribute("href")).toBe("/repositories");
    await waitFor(() => expect(document.title).toBe("Repositories · OpenCircle"));
    const table = screen.getByRole("list", { name: "Repositories ranked by stars" });
    expect(within(table).getByRole("link", { name: /open-kit/ }).getAttribute("href")).toBe("https://github.com/Octocat/open-kit");
    expect(within(table).getAllByRole("listitem")).toHaveLength(1);
    const podium = screen.getByRole("list", { name: "Top three repositories" });
    expect(within(podium).getByRole("link", { name: /open-kit, rank 1, .* stars/ }).getAttribute("href")).toBe("https://github.com/Octocat/open-kit");
    expect(podium.textContent).toContain("forks");
    expect(podium.textContent).not.toContain("contributions");
    expect(screen.getByRole("searchbox", { name: "Search repositories" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Nickname" }) as HTMLInputElement).value).toBe("Octo");
    expect((screen.getByRole("textbox", { name: /WhatsApp number used/i }) as HTMLInputElement).value).toBe("+234 803 123 4567");
    await user.click(screen.getByRole("tab", { name: /Developers/ }));
    expect(screen.getByRole("list", { name: "Top three" })).toBeTruthy();
  });

  it("sends a legacy tab query to the repository route", async () => {
    render(<Providers client={clientFor(boardFixture())} path="/?tab=repositories"><Index /><LocationMarker /></Providers>);
    await waitFor(() => expect(screen.getByRole("status", { name: "Current path" }).textContent).toBe("/repositories"));
    expect(screen.getByText("Public projects from members, ranked by stars.")).toBeTruthy();
  });

  it("joins from the repository view and opens the page containing the new member", async () => {
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
    await user.type(screen.getByRole("textbox", { name: /WhatsApp number used/i }), "+234 803 123 4567");
    await user.click(screen.getByRole("button", { name: "Join the board" }));

    await screen.findByText("You're in.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You're on the board.Ranked #55.");
    await waitFor(() => expect(screen.getByRole("status", { name: "Current path" }).textContent).toBe("/"));
    await waitFor(() => expect(document.getElementById("member-octocat")).toBeTruthy());
    const row = document.getElementById("member-octocat")!;
    expect(screen.getByRole("columnheader", { name: "Contributions" })).toBeTruthy();
    expect(within(row).getByText("9 contributions · 0 upvotes")).toBeTruthy();
    expect(within(row).getByText("55")).toBeTruthy();
    expect(within(row).getByText("Octo")).toBeTruthy();
    expect(within(row).getByText("You")).toBeTruthy();
    const pagination = within(screen.getByRole("navigation", { name: "Developers pagination" }));
    expect(pagination.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(13);
    await user.click(pagination.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(document.getElementById("member-octocat")).toBeNull());
    expect(client.getQueryData<Board>(BOARD_KEY)?.members.at(-1)).toMatchObject({ login: "Octocat", rank: 55 });
  });

  it("supports a direct repositories link and an honest empty state", async () => {
    const board = boardFixture();
    render(<Providers client={clientFor(board)} path="/repositories"><Index /></Providers>);

    expect(screen.getByRole("tab", { name: /Repositories 0/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Tools 0/ })).toBeTruthy();
    expect(screen.getByText("No repositories yet")).toBeTruthy();
    expect(screen.getByText(`OpenCircle v${packageJson.version}`)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Repositories ranked by stars" })).toBeNull();
  });
});
