import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../shared/types";
import type { CommunityState } from "../shared/community";
import type { ParticipationState } from "../shared/coordination";
import Index from "../src/pages/Index";
import Participation from "../src/pages/Participation";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { AccountSkeleton, BoardSkeleton, CommunityVotesSkeleton, ParticipationSkeleton, ToolsSkeleton } from "../src/components/site-skeleton";
import { BOARD_KEY } from "../src/hooks/use-board";
import { api } from "../src/lib/api";
import { boardFixture, publicMember, repository } from "./helpers/fixtures";

vi.mock("../src/lib/api", async (original) => ({
  ...await original<typeof import("../src/lib/api")>(),
  api: { board: vi.fn(), community: vi.fn(), participation: vi.fn(), signOut: vi.fn(), toolVote: vi.fn() },
}));

const clients: QueryClient[] = [];
const community: CommunityState = {
  tools: [], counts: {}, voted: [], toolVotes: {}, profile: null, signInAvailable: true,
};
const board = boardFixture({
  members: [1, 2, 3, 4].map((rank) => publicMember({ login: `builder${rank}`, nickname: `Builder ${rank}`, rank })),
  repositories: [{ ...repository(), rank: 1, ownerLogin: "Octocat", ownerNickname: "Octo", ownerAvatarUrl: "" }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function renderPage(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><MotionConfig reducedMotion="always"><TooltipProvider><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{path === "/participation" ? <Participation /> : <Index />}</MemoryRouter></TooltipProvider></MotionConfig></QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(api.board).mockReset().mockResolvedValue(board);
  vi.mocked(api.community).mockReset().mockResolvedValue(community);
  vi.mocked(api.participation).mockReset();
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("Public Skelo loading", () => {
  it("uses inert presentation templates without font measurements, images or interactive controls", () => {
    const measureText = vi.spyOn(document, "createRange");
    const { container } = render(<>
      <BoardSkeleton /><BoardSkeleton repositories /><ToolsSkeleton />
      <ParticipationSkeleton /><ParticipationSkeleton checkingSignIn />
      <AccountSkeleton /><CommunityVotesSkeleton />
    </>);
    expect(measureText).not.toHaveBeenCalled();
    expect(container.querySelectorAll("[data-loading-template][inert]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("img, input, button, a")).toHaveLength(0);
    expect(screen.getAllByRole("status")).toHaveLength(7);
  });

  it.each([
    ["/", "Loading developer rankings…", "Ranks 4 and below"],
    ["/repositories", "Loading repositories…", "Repositories ranked by stars"],
  ])("loads %s and preserves its results during a background refresh", async (path, label, tableName) => {
    const initial = deferred<Board>();
    const refresh = deferred<Board>();
    vi.mocked(api.board).mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise);
    const { client } = renderPage(path);
    expect(screen.getByRole("status", { name: label }).querySelector(".lr-skeleton")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/#\d open/)).toBeNull();
    await act(async () => initial.resolve(board));
    await screen.findByRole("table", { name: tableName });
    expect(screen.queryByRole("status", { name: label })).toBeNull();
    await act(async () => { void client.invalidateQueries({ queryKey: BOARD_KEY }); });
    await waitFor(() => expect(api.board).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("table", { name: tableName })).toBeTruthy();
    expect(screen.queryByRole("status", { name: label })).toBeNull();
    await act(async () => refresh.resolve(board));
  });

  it("keeps the tabs usable and loads tools independently of the board", async () => {
    const rankings = deferred<Board>();
    const tools = deferred<CommunityState>();
    vi.mocked(api.board).mockReturnValue(rankings.promise);
    vi.mocked(api.community).mockReturnValue(tools.promise);
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /^Tools/ }));
    expect(screen.getByRole("status", { name: "Loading tools…" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading developer rankings…" })).toBeNull();
    await act(async () => tools.resolve(community));
    await screen.findByText("No tools shared yet.");
    expect(screen.queryByRole("status", { name: "Loading tools…" })).toBeNull();
    expect(screen.getByRole("link", { name: /^Skelo/ }).getAttribute("href")).toBe("https://github.com/appdever01/skelo");
    expect(screen.getByText(/Skeleton loaders made easy with/)).toBeTruthy();
  });

  it("applies searches entered while tools are still loading", async () => {
    const tools = deferred<CommunityState>();
    vi.mocked(api.community).mockReturnValue(tools.promise);
    renderPage("/tools");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search tools" }), "docs");
    expect(screen.getByRole("status", { name: "Loading tools…" })).toBeTruthy();
    await act(async () => tools.resolve({ ...community, tools: [
      { id: "docs", name: "DevDocs", url: "https://devdocs.io/", description: "Programming documentation.", category: "Learning", source: "curated", status: "approved", createdAt: 1 },
      { id: "editor", name: "VS Code", url: "https://code.visualstudio.com/", description: "Code editor.", category: "Development", source: "curated", status: "approved", createdAt: 1 },
    ] }));
    await screen.findByRole("link", { name: /^DevDocs/ });
    expect(screen.queryByRole("link", { name: /^VS Code/ })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading tools…" })).toBeNull();
  });

  it("replaces a failed board load with recovery and loads the empty state after retry", async () => {
    vi.mocked(api.board).mockRejectedValue(new Error("Offline"));
    renderPage();
    await screen.findByText("Couldn't load the board.");
    expect(screen.queryByRole("status", { name: "Loading developer rankings…" })).toBeNull();
    vi.mocked(api.board).mockResolvedValue(boardFixture());
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Nobody's on the board yet");
    expect(screen.queryByRole("status", { name: "Loading developer rankings…" })).toBeNull();
  });

  it("checks sign-in before requesting private participation, then shows the correct form", async () => {
    const session = deferred<CommunityState>();
    const participation = deferred<ParticipationState>();
    vi.mocked(api.community).mockReturnValue(session.promise);
    vi.mocked(api.participation).mockReturnValue(participation.promise);
    renderPage("/participation");
    expect(screen.getByRole("status", { name: "Checking sign-in…" })).toBeTruthy();
    expect(api.participation).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Sign in with GitHub" })).toBeNull();
    await act(async () => session.resolve({ ...community, profile: { id: 1, login: "Alice", avatarUrl: "https://avatars.githubusercontent.com/u/1" } }));
    await screen.findByRole("status", { name: "Loading your participation…" });
    await act(async () => participation.resolve({
      activity: { linked: false, login: null, enabled: true, tracking: false, contributions: 0, reviewPeers: 0, target: 4, requiredReviewPeers: 2, inactiveDays: 0, graceRemainingDays: 14, awayUntil: null, awayRequestedDays: null, pendingContributions: 0, removalReview: false },
      projects: [], help: [], contributions: [],
    }));
    await screen.findByRole("textbox", { name: "Your WhatsApp group number" });
    expect(screen.queryByRole("status", { name: "Loading your participation…" })).toBeNull();
  });
});
