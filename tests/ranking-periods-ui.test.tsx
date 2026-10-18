import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "@/pages/Index";
import { api } from "@/lib/api";
import { writeMe } from "@/lib/identity";
import { BOARD_KEY } from "@/hooks/use-board";
import { boardFixture, publicMember } from "./helpers/fixtures";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  api: { board: vi.fn(), community: vi.fn() },
}));

const members = Array.from({ length: 26 }, (_, index) => publicMember({
  login: `builder${index}`, nickname: `Builder ${index}`, rank: index + 1,
  score: 1000 - index, helpfulContributions: 10 - Math.min(index, 10), starHelps: 1, helperPoints: 1000 - index - 20,
}));
const week = [...members].reverse().map((member, index) => ({ ...member, rank: index + 1, score: 50 - index, helpfulContributions: 1, helperPoints: 30 - index, starHelps: 0, delta: 0 }));
const month = [members[1], members[2], members[0], ...members.slice(3)].map((member, index) => ({ ...member, rank: index + 1, score: 100 - index, helpfulContributions: 2, starHelps: 0, helperPoints: 80 - index, delta: 0 }));
const board = boardFixture({ members, helperHistoryReady: true, periods: { "7d": week, "30d": month } });
let client: QueryClient;

function History() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><div data-testid="location">{location.pathname}{location.search}</div><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
}

function mount(path = "/") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return render(<ThemeProvider><QueryClientProvider client={client}><TooltipProvider><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Index /><History /></MemoryRouter></TooltipProvider></QueryClientProvider></ThemeProvider>);
}

beforeEach(() => {
  writeMe("builder0");
  vi.mocked(api.board).mockResolvedValue(board);
  vi.mocked(api.community).mockResolvedValue({ profile: null, signInAvailable: true, tools: [], counts: {}, voted: [], toolVotes: {} });
});
afterEach(() => { client?.clear(); document.documentElement.className = ""; });

it("switches the podium, personal rank, table and pagination between real period snapshots", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText(/Ranked #1\./);
  await user.click(within(screen.getByRole("navigation", { name: "Developers pagination" })).getByRole("button", { name: "Next" }));
  expect(within(screen.getByRole("table")).getAllByRole("row")[1].textContent).toContain("Builder 23");
  await user.click(within(screen.getByRole("tablist", { name: "Ranking period" })).getByRole("tab", { name: "7 days" }));
  await screen.findByText(/Ranked #26\./);
  expect(screen.getByTestId("location").textContent).toBe("/?period=7d");
  expect(within(screen.getByRole("list", { name: "Top three" })).getByText("Builder 25")).toBeTruthy();
  expect(within(screen.getByRole("table")).getAllByRole("row")[1].textContent).toContain("Builder 22");
  expect(screen.getByRole("columnheader", { name: "Help · 7 days" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "30 days" }));
  await screen.findByText(/Ranked #3\./);
  expect(screen.getByTestId("location").textContent).toBe("/?period=30d");
  expect(screen.getByRole("columnheader", { name: "Help · 30 days" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "All time" }));
  await screen.findByText(/Ranked #1\./);
  expect(screen.getByTestId("location").textContent).toBe("/");
  expect(api.board).toHaveBeenCalledTimes(1);
});

it("keeps the selected period through history, the explanation dialog, tabs and refreshed board data", async () => {
  const user = userEvent.setup();
  mount("/?period=7d");
  await screen.findByText(/Ranked #26\./);
  await user.click(screen.getByRole("tab", { name: "30 days" }));
  await screen.findByText(/Ranked #3\./);
  await user.click(screen.getByRole("button", { name: "Back" }));
  await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/?period=7d"));
  await screen.findByText(/Ranked #26\./);
  await user.click(screen.getByRole("button", { name: "Forward" }));
  await screen.findByText(/Ranked #3\./);
  await user.click(screen.getByRole("button", { name: "How ranking works" }));
  const dialog = screen.getByRole("dialog", { name: "How ranking works" });
  expect(dialog.textContent!.split(/\s+/).length).toBeLessThan(170);
  expect(dialog.textContent).not.toContain("28 days");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByTestId("location").textContent).toBe("/?period=30d");
  await user.click(screen.getByRole("tab", { name: /^Spotlight/ }));
  expect(screen.getByTestId("location").textContent).toBe("/repositories?period=30d");
  await user.click(screen.getByRole("tab", { name: /^Developers/ }));
  expect(screen.getByRole("tab", { name: "30 days" }).getAttribute("aria-selected")).toBe("true");
  await act(async () => client.setQueryData(BOARD_KEY, { ...board, updatedAt: board.updatedAt + 1, periods: { ...board.periods, "30d": week } }));
  await screen.findByText(/Ranked #26\./);
});

it("does not show all-time scores or an empty-community claim while period history is unavailable", async () => {
  vi.mocked(api.board).mockResolvedValue({ ...board, periods: undefined, helperHistoryReady: false, helpersDelayed: true });
  mount("/?period=7d");
  await screen.findByText("This period is waiting for help history. Try again shortly.");
  expect(screen.queryByRole("list", { name: "Top three" })).toBeNull();
  expect(screen.queryByText("Nobody's on the board yet")).toBeNull();
  expect(screen.queryByText(/Ranked #1\./)).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: "All time" }));
  await screen.findByText(/Ranked #1\./);
});

it("supports period selection by keyboard and defaults unknown periods to all time", async () => {
  mount("/?period=invalid");
  await screen.findByText(/Ranked #1\./);
  const all = screen.getByRole("tab", { name: "All time" });
  all.focus();
  await userEvent.keyboard("{ArrowRight}");
  await screen.findByText(/Ranked #26\./);
  expect(screen.getByRole("tab", { name: "7 days" }).getAttribute("aria-selected")).toBe("true");
});
