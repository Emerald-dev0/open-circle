import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../src/lib/api";
import { toast } from "sonner";
import { MotionConfig } from "motion/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityState } from "../shared/community";
import type { PublicRepository } from "../shared/types";
import { RepositoryExplorer } from "../src/components/board/repository-explorer";
import { repository } from "./helpers/fixtures";

const hooks = vi.hoisted(() => ({ community: vi.fn(), vote: vi.fn() }));
vi.mock("@/hooks/use-community", () => ({ useCommunity: hooks.community, useCommunityVote: hooks.vote }));

const repositories: PublicRepository[] = [
  { ...repository({ id: "R_cli", name: "circle-cli", fullName: "spark/circle-cli", url: "https://github.com/spark/circle-cli", stars: 40, updatedAt: "2026-10-12T12:00:00Z" }), rank: 1, ownerLogin: "spark", ownerNickname: "Spark", ownerAvatarUrl: "" },
  { ...repository({ id: "R_canvas", name: "canvas", fullName: "pixel/canvas", url: "https://github.com/pixel/canvas", stars: 10, language: "JavaScript", description: "A drawing tool", updatedAt: "2026-10-13T12:00:00Z" }), rank: 2, ownerLogin: "pixel", ownerNickname: "Pixel", ownerAvatarUrl: "" },
  { ...repository({ id: "R_docs", name: "docs", fullName: "sage/docs", url: "https://github.com/sage/docs", stars: 5, language: null, updatedAt: "2026-10-14T12:00:00Z" }), rank: 3, ownerLogin: "sage", ownerNickname: "Sage", ownerAvatarUrl: "" },
];

let data: CommunityState;
const mutate = vi.fn();
const refetch = vi.fn();

function explorer(items = repositories) {
  return <MotionConfig reducedMotion="always"><RepositoryExplorer repositories={items} /></MotionConfig>;
}

function displayedRepositories() {
  return screen.queryAllByRole("listitem").map((item) => within(item).getByRole("link").getAttribute("href"));
}

async function selectOption(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(await screen.findByRole("option", { name: option }));
}

beforeEach(() => {
  data = { tools: [], counts: { "repo:R_cli": 2, "repo:R_canvas": 5, "repo:R_docs": 20 }, voted: [] };
  mutate.mockReset();
  refetch.mockReset();
  vi.mocked(toast.message).mockClear();
  hooks.community.mockReturnValue({ data, isPending: false, error: null, refetch });
  hooks.vote.mockReturnValue({ mutate, isPending: false, variables: undefined, error: null });
});

describe("Repository discovery", () => {
  it("keeps cached repository votes available during a temporary refresh limit", async () => {
    hooks.community.mockReturnValue({ data, isPending: false, error: new ApiError(429, "rate_limited", "Updates will resume shortly."), refetch });
    render(explorer());
    const vote = screen.getByRole("button", { name: "Upvote spark/circle-cli" });
    expect((vote as HTMLButtonElement).disabled).toBe(false);
    await userEvent.setup().click(vote);
    expect(mutate).toHaveBeenCalledWith({ target: "repo:R_cli", active: true });
  });

  it("keeps long repository names, owners and exact GitHub counts available alongside community actions", async () => {
    const name = "repository-".repeat(12);
    const ownerLogin = "builder-".repeat(4);
    const repo = { ...repositories[0], name, ownerLogin, fullName: `${ownerLogin}/${name}`, stars: 1_234_567, forks: 12_345 };
    render(explorer([repo]));

    const link = screen.getByRole("link", { name: `${name} (opens in a new tab)` });
    const row = link.closest("li")!;
    expect(link.getAttribute("href")).toBe(repo.url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(row).getByLabelText("Rank 1").textContent).toBe("#1");
    expect(within(row).getByText(`@${ownerLogin}`)).toBeTruthy();
    expect(within(row).getByText("TypeScript")).toBeTruthy();
    expect(within(row).getByLabelText("1,234,567 GitHub stars").textContent).toContain("1.2M");
    expect(within(row).getByLabelText("12,345 forks").textContent).toContain("12.3K");
    expect(within(row).getByLabelText(`2 upvotes for ${repo.fullName}`).textContent).toBe("2");

    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: `Save ${repo.fullName}` }));
    expect(within(row).getByRole("button", { name: `Unsave ${repo.fullName}` }).getAttribute("aria-pressed")).toBe("true");
    await user.click(within(row).getByRole("button", { name: `Upvote ${repo.fullName}` }));
    expect(mutate).toHaveBeenCalledWith({ target: "repo:R_cli", active: true });
  });

  it("explains when a bookmark can only be kept for the current visit", async () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    render(explorer());
    await userEvent.setup().click(screen.getByRole("button", { name: "Save spark/circle-cli" }));
    expect(screen.getByRole("button", { name: "Unsave spark/circle-cli" }).getAttribute("aria-pressed")).toBe("true");
    expect(toast.message).toHaveBeenCalledWith("Saved for this visit. Browser storage is unavailable.");
  });
  it("searches repository names, owners and descriptions and resets a combined language filter", async () => {
    render(explorer());
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: "Search repositories" });

    await user.type(search, "drawing");
    await waitFor(() => expect(displayedRepositories()).toEqual([repositories[1].url]));
    expect(screen.getByRole("status").textContent).toBe("1 of 3 repositories");
    await user.clear(search);
    await user.type(search, "SPARK");
    await waitFor(() => expect(displayedRepositories()).toEqual([repositories[0].url]));
    await selectOption(user, "Filter by language", "JavaScript");
    expect(screen.getByText("No repositories match your filters.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Browse all repositories" }));
    expect(screen.getByRole("combobox", { name: "Filter by language" }).textContent).toBe("All languages");
    await waitFor(() => expect(displayedRepositories()).toEqual(repositories.map((repo) => repo.url)));
    await user.type(search, "circle-cli");
    await waitFor(() => expect(displayedRepositories()).toEqual([repositories[0].url]));
  });

  it("sorts by actual community votes or recent updates while keeping GitHub stars separate", async () => {
    render(explorer());
    const user = userEvent.setup();
    await selectOption(user, "Sort repositories", "Community upvotes");
    await waitFor(() => expect(displayedRepositories()).toEqual([repositories[2].url, repositories[1].url, repositories[0].url]));
    const cliRow = screen.getByRole("button", { name: "Upvote spark/circle-cli" }).closest<HTMLElement>("li")!;
    expect(within(cliRow).getByText("40")).toBeTruthy();
    expect(within(cliRow).getByLabelText("2 upvotes for spark/circle-cli").textContent).toBe("2");
    expect(screen.getByRole("list", { name: "Repositories ranked by community upvotes" })).toBeTruthy();
    await selectOption(user, "Sort repositories", "Recently updated");
    expect(displayedRepositories()[0]).toBe(repositories[2].url);
    await selectOption(user, "Sort repositories", "Most stars");
    expect(displayedRepositories()[0]).toBe(repositories[0].url);
  });

  it("saves repositories on this device, restores them after remounting, and can unsave", async () => {
    const view = render(explorer());
    const user = userEvent.setup();
    const save = screen.getByRole("button", { name: "Save pixel/canvas" });
    save.focus();
    await user.keyboard("{Enter}");
    expect(JSON.parse(localStorage.getItem("opencircle:saved-repositories:v1")!)).toEqual(["R_canvas"]);
    view.unmount();
    render(explorer());
    expect(screen.getByRole("button", { name: "Unsave pixel/canvas" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Unsave pixel/canvas" }));
    expect(screen.getByRole("button", { name: "Save pixel/canvas" }).getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(localStorage.getItem("opencircle:saved-repositories:v1")!)).toEqual([]);
    expect(displayedRepositories()).toHaveLength(3);
  });

  it("sends idempotent vote intent by keyboard and offers removal after the vote is confirmed", async () => {
    const view = render(explorer());
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Upvote sage/docs" }).focus();
    await user.keyboard("{Enter}");
    expect(mutate).toHaveBeenCalledWith({ target: "repo:R_docs", active: true });
    hooks.community.mockReturnValue({ data: { ...data, voted: ["repo:R_docs"], counts: { ...data.counts, "repo:R_docs": 21 } }, isPending: false, error: null, refetch });
    view.rerender(explorer());
    const remove = screen.getByRole("button", { name: "Remove upvote from sage/docs" });
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("21 upvotes for sage/docs").textContent).toBe("21");
    await user.click(remove);
    expect(mutate).toHaveBeenLastCalledWith({ target: "repo:R_docs", active: false });
  });

  it("keeps discovery and local saves usable while upvotes load or fail, with a real retry", async () => {
    hooks.community.mockReturnValue({ data: undefined, isPending: true, error: null, refetch });
    const view = render(explorer());
    const user = userEvent.setup();
    expect(screen.getByText("Loading community upvotes…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Upvote sage/docs" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save sage/docs" }));
    expect(screen.getByRole("button", { name: "Unsave sage/docs" }).getAttribute("aria-pressed")).toBe("true");
    hooks.community.mockReturnValue({ data: undefined, isPending: false, error: new Error("Network failed"), refetch });
    view.rerender(explorer());
    expect(screen.getByRole("alert").textContent).toContain("Community upvotes could not load.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(displayedRepositories()).toHaveLength(3);
  });

  it("prevents another vote while saving and shows the server's failed-vote message", () => {
    hooks.vote.mockReturnValue({ mutate, isPending: true, variables: { target: "repo:R_docs", active: true }, error: null });
    const view = render(explorer());
    expect((screen.getByRole("button", { name: "Upvote sage/docs" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Upvote sage/docs" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Upvote spark/circle-cli" }).hasAttribute("aria-busy")).toBe(false);
    hooks.vote.mockReturnValue({ mutate, isPending: false, variables: undefined, error: new Error("Too many upvotes. Try again in a minute.") });
    view.rerender(explorer());
    expect(screen.getByRole("alert").textContent).toBe("Too many upvotes. Try again in a minute.");
    expect((screen.getByRole("button", { name: "Upvote sage/docs" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("handles malformed saved data and an empty board without inventing repositories", () => {
    localStorage.setItem("opencircle:saved-repositories:v1", "{not-json");
    render(explorer([]));
    expect(screen.getByText("No repositories yet.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("paginates repositories, keeps their ranks and actions, and resets after a search", async () => {
    const items = Array.from({ length: 55 }, (_, index) => ({ ...repositories[0], id: `R_${index}`, name: `repo-${String(index).padStart(2, "0")}`, fullName: `spark/repo-${String(index).padStart(2, "0")}`, url: `https://github.com/spark/repo-${index}`, rank: index + 1 }));
    render(explorer(items));
    const user = userEvent.setup();
    const pagination = () => within(screen.getByRole("navigation", { name: "Repositories pagination" }));
    expect(displayedRepositories()).toHaveLength(20);
    expect((pagination().getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(pagination().getByRole("button", { name: "Next" }));
    expect(displayedRepositories()).toHaveLength(20);
    expect(screen.getByLabelText("Rank 21")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save spark/repo-20" }));
    expect(screen.getByRole("button", { name: "Unsave spark/repo-20" })).toBeTruthy();
    await user.click(pagination().getByRole("button", { name: "Next" }));
    expect(displayedRepositories()).toHaveLength(15);
    expect((pagination().getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole("searchbox", { name: "Search repositories" }), "repo-00");
    expect(displayedRepositories()).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Repositories pagination" })).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Search repositories" }));
    expect(screen.getByLabelText("Rank 1")).toBeTruthy();
    expect(displayedRepositories()).toHaveLength(20);
  });
});
