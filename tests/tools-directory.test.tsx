import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityState, CommunityTool } from "../shared/community";
import { ToolsDirectory } from "../src/components/board/tools-directory";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ApiError, api } from "../src/lib/api";
import { toast } from "sonner";

const communityMock = vi.hoisted(() => ({
  query: { data: undefined as CommunityState | undefined, isLoading: false, isError: false, refetch: vi.fn() },
  vote: { mutate: vi.fn(), isPending: false, variables: undefined as { target: string; value: -1 | 0 | 1 } | undefined, error: null as Error | null },
}));

vi.mock("../src/hooks/use-community", () => ({
  COMMUNITY_KEY: ["community"],
  GITHUB_SIGN_OUT_KEY: ["github-sign-out"],
  useCommunity: () => communityMock.query,
  useToolVote: () => communityMock.vote,
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/api")>(),
  api: { submitTool: vi.fn(), signOut: vi.fn() },
}));


const fixtures: CommunityTool[] = [
  { id: "editor", name: "VS Code", url: "https://code.visualstudio.com/", description: "Edit code with extensions.", category: "Development", source: "curated", status: "approved", sourceUrl: "https://code.visualstudio.com/docs", createdAt: 100 },
  { id: "design", name: "Penpot", url: "https://penpot.app/", description: "Design interfaces with your team.", category: "Design", source: "curated", status: "approved", createdAt: 200 },
  { id: "docs", name: "DevDocs", url: "https://devdocs.io/", description: "Search programming documentation.", category: "Learning", source: "community", status: "approved", createdAt: 400 },
  { id: "tasks", name: "Linear", url: "https://linear.app/", description: "Organize team tasks.", category: "Productivity", source: "community", status: "approved", createdAt: 300 },
];
const profile = { id: 1, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" };
const clients: QueryClient[] = [];

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    ...render(<QueryClientProvider client={client}><TooltipProvider><ToolsDirectory /></TooltipProvider></QueryClientProvider>),
  };
}

function listedNames() {
  return within(screen.getByRole("list", { name: "Tools" })).getAllByRole("listitem").map((row) => within(row).getAllByRole("link")[0].textContent);
}

async function chooseOption(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: option }));
}

async function fillTool(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Share a tool" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "My useful tool");
  await user.type(screen.getByRole("textbox", { name: "URL" }), "https://example.com/tool");
  await user.type(screen.getByRole("textbox", { name: "Description" }), "A useful tool for the community.");
  await chooseOption(user, "Category", "Productivity");
}

beforeEach(() => {
  communityMock.query.data = { tools: fixtures, counts: { "tool:editor": 3, "tool:design": 9, "tool:docs": 2 }, voted: [], profile, signInAvailable: true, toolVotes: {} };
  communityMock.query.isLoading = false;
  communityMock.query.isError = false;
  communityMock.query.refetch.mockReset();
  communityMock.vote.mutate.mockReset();
  communityMock.vote.isPending = false;
  communityMock.vote.variables = undefined;
  communityMock.vote.error = null;
  vi.mocked(api.submitTool).mockReset();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("Community tools directory", () => {
  it("supports downvotes, switching direction and removing a downvote", async () => {
    communityMock.query.data!.toolVotes = { "tool:docs": -1 };
    communityMock.query.data!.counts["tool:docs"] = -2;
    renderDirectory();
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Remove downvote for DevDocs" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Remove downvote for DevDocs" }));
    expect(communityMock.vote.mutate).toHaveBeenLastCalledWith({ target: "tool:docs", value: 0 });
    await user.click(screen.getByRole("button", { name: "Upvote DevDocs" }));
    expect(communityMock.vote.mutate).toHaveBeenLastCalledWith({ target: "tool:docs", value: 1 });
    await user.click(screen.getByRole("button", { name: "Downvote VS Code" }));
    expect(communityMock.vote.mutate).toHaveBeenLastCalledWith({ target: "tool:editor", value: -1 });
    expect(screen.getByLabelText("-2 net votes for DevDocs")).toBeTruthy();
  });

  it("requires GitHub sign-in for both directions while allowing bookmarks", async () => {
    communityMock.query.data!.profile = null;
    renderDirectory();
    expect(screen.queryByRole("link", { name: "Sign in to vote" })).toBeNull();
    for (const button of screen.getAllByRole("button", { name: /^(Upvote|Downvote) / })) expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save DevDocs" }));
    expect(screen.getByRole("button", { name: "Unsave DevDocs" })).toBeTruthy();
    expect(communityMock.vote.mutate).not.toHaveBeenCalled();
  });

  it("shows unavailable sign-in without pretending voting is enabled", () => {
    communityMock.query.data!.profile = null;
    communityMock.query.data!.signInAvailable = false;
    renderDirectory();
    expect(screen.queryByRole("button", { name: "Sign in to vote" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in to vote" })).toBeNull();
  });

  it("sorts by real upvotes and filters by search and category", async () => {
    renderDirectory();
    const user = userEvent.setup();
    expect(listedNames()[0]).toContain("Penpot");
    await user.type(screen.getByRole("searchbox", { name: "Search tools" }), "documentation");
    expect(listedNames()).toHaveLength(1);
    expect(listedNames()[0]).toContain("DevDocs");
    await chooseOption(user, "Filter tools by category", "Design");
    expect(screen.getByText("No tools match these filters.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show all tools" }));
    await chooseOption(user, "Sort tools", "Newest");
    expect(listedNames()[0]).toContain("DevDocs");
    await chooseOption(user, "Sort tools", "Name");
    expect(listedNames().map((name) => name.split(" (opens")[0])).toEqual(["DevDocs", "Linear", "Penpot", "VS Code"]);
  });

  it("sends the desired vote state", async () => {
    communityMock.query.data!.toolVotes = { "tool:editor": 1 };
    renderDirectory();
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Remove upvote for VS Code" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Remove upvote for VS Code" }));
    expect(communityMock.vote.mutate).toHaveBeenLastCalledWith({ target: "tool:editor", value: 0 });
    await user.click(screen.getByRole("button", { name: "Upvote DevDocs" }));
    expect(communityMock.vote.mutate).toHaveBeenLastCalledWith({ target: "tool:docs", value: 1 });
    expect(communityMock.vote.mutate).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("One vote per tool in this browser.")).toBeNull();
  });

  it("supports keyboard selection in the custom category and sort menus", async () => {
    renderDirectory();
    const user = userEvent.setup();
    screen.getByRole("combobox", { name: "Sort tools" }).focus();
    await user.keyboard("{ArrowDown}{End}{Enter}");
    expect(screen.getByRole("combobox", { name: "Sort tools" }).textContent).toContain("Name");
    expect(listedNames()[0]).toContain("DevDocs");
    screen.getByRole("combobox", { name: "Filter tools by category" }).focus();
    await user.keyboard("{ArrowDown}{End}{Enter}");
    expect(screen.getByRole("combobox", { name: "Filter tools by category" }).textContent).toContain("Learning");
    expect(listedNames()).toHaveLength(1);
    expect(listedNames()[0]).toContain("DevDocs");
  });

  it.each(["pending", "stale"])("prevents all tool votes while %s", async (state) => {
    communityMock.vote.isPending = state === "pending";
    communityMock.vote.variables = { target: "tool:design", value: 1 };
    communityMock.query.isError = state === "stale";
    renderDirectory();
    const user = userEvent.setup();
    const voteButtons = screen.getAllByRole("button", { name: /^Upvote / });
    expect(voteButtons).toHaveLength(4);
    for (const button of voteButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      await user.click(button);
    }
    expect(communityMock.vote.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save DevDocs" }));
    expect(screen.getByRole("button", { name: "Unsave DevDocs" })).toBeTruthy();
  });

  it("keeps saved tool markers in this browser without a Saved only filter", async () => {
    const first = renderDirectory();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save DevDocs" }));
    expect(JSON.parse(localStorage.getItem("opencircle.saved-tools")!)).toEqual(["docs"]);
    first.unmount();
    renderDirectory();
    expect(screen.queryByRole("button", { name: "Saved only" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unsave DevDocs" }).getAttribute("aria-pressed")).toBe("true");
    expect(listedNames()).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Unsave DevDocs" }));
    expect(screen.getByRole("button", { name: "Save DevDocs" }).getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(localStorage.getItem("opencircle.saved-tools")!)).toEqual([]);
  });

  it("recovers from malformed saved data and shows honest loading, errors and empty states", async () => {
    localStorage.setItem("opencircle.saved-tools", "not-json");
    communityMock.query.data = undefined;
    communityMock.query.isLoading = true;
    const first = renderDirectory();
    expect(screen.getByRole("status").textContent).toContain("Loading tools");
    first.unmount();
    communityMock.query.isLoading = false;
    communityMock.query.isError = true;
    const second = renderDirectory();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry tools" }));
    expect(communityMock.query.refetch).toHaveBeenCalledTimes(1);
    second.unmount();
    communityMock.query.isError = false;
    communityMock.query.data = { tools: [], counts: {}, voted: [], profile, signInAvailable: true, toolVotes: {} };
    renderDirectory();
    expect(screen.getByText("No tools shared yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Upvote / })).toBeNull();
  });

  it("syncs saved tools when another tab changes or clears browser storage", async () => {
    renderDirectory();
    expect(screen.getByRole("button", { name: "Save DevDocs" }).getAttribute("aria-pressed")).toBe("false");
    act(() => {
      localStorage.setItem("opencircle.saved-tools", JSON.stringify(["docs"]));
      window.dispatchEvent(new StorageEvent("storage", { key: "opencircle.saved-tools" }));
    });
    expect(screen.getByRole("button", { name: "Unsave DevDocs" }).getAttribute("aria-pressed")).toBe("true");
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByRole("button", { name: "Save DevDocs" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("waits for the initial visitor request before allowing a tool submission", async () => {
    communityMock.query.data = undefined;
    communityMock.query.isLoading = true;
    renderDirectory();
    const share = screen.getByRole("button", { name: "Share a tool" }) as HTMLButtonElement;
    expect(share.disabled).toBe(true);
    await userEvent.setup().click(share);
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(api.submitTool).not.toHaveBeenCalled();
  });

  it("validates before submission and preserves the form through a server rejection", async () => {
    vi.mocked(api.submitTool).mockRejectedValueOnce(new ApiError(409, "duplicate", "That tool has already been shared.", "url"));
    renderDirectory();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Share a tool" }));
    await user.click(screen.getByRole("button", { name: "Share tool" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(api.submitTool).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "My useful tool");
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://example.com/tool");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "A useful tool for the community.");
    await user.click(screen.getByRole("button", { name: "Share tool" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already been shared");
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("My useful tool");
    expect((screen.getByRole("textbox", { name: "URL" }) as HTMLInputElement).value).toBe("https://example.com/tool");
    expect(screen.getByRole("textbox", { name: "URL" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("sends a tool for admin review without publishing it, then resets the form", async () => {
    vi.mocked(api.submitTool).mockResolvedValueOnce({ ...fixtures[3], id: "new", name: "My useful tool", status: "pending" });
    const { client } = renderDirectory();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    await fillTool(user);
    await user.click(screen.getByRole("button", { name: "Share tool" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull());
    expect(api.submitTool).toHaveBeenCalledWith({ name: "My useful tool", url: "https://example.com/tool", description: "A useful tool for the community.", category: "Productivity" }, expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["community"] });
    expect(toast.success).toHaveBeenCalledWith("Sent to admins for review.");
    expect(screen.getByRole("status").textContent).toContain("It will appear here once approved.");
    expect(screen.queryByRole("link", { name: /My useful tool/ })).toBeNull();
    expect(listedNames()).toHaveLength(4);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share a tool" }));
    await user.click(screen.getByRole("button", { name: "Share a tool" }));
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("");
  });

  it("locks submitted fields and the form toggle until a request finishes", async () => {
    let rejectRequest!: (error: Error) => void;
    vi.mocked(api.submitTool).mockImplementationOnce(() => new Promise<CommunityTool>((_resolve, reject) => { rejectRequest = reject; }));
    renderDirectory();
    const user = userEvent.setup();
    await fillTool(user);
    await user.click(screen.getByRole("button", { name: "Share tool" }));
    await screen.findByRole("button", { name: "Sending…" });
    const name = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    for (const label of ["Name", "URL", "Description"]) {
      expect(screen.getByRole("textbox", { name: label }).matches(":disabled")).toBe(true);
    }
    expect(screen.getByRole("combobox", { name: "Category" }).matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Close form" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(name, " new edits");
    await user.click(screen.getByRole("button", { name: "Close form" }));
    expect(name.value).toBe("My useful tool");
    expect(api.submitTool).toHaveBeenCalledTimes(1);
    await act(async () => rejectRequest(new Error("Please try again.")));
    await screen.findByRole("alert");
    await waitFor(() => expect(name.matches(":disabled")).toBe(false));
    await user.type(name, " revised");
    expect(name.value).toBe("My useful tool revised");
  });

  it("shows vote failures and source links without replacing useful cached tools", () => {
    communityMock.query.isError = true;
    communityMock.vote.error = new Error("Voting is temporarily unavailable.");
    renderDirectory();
    expect(screen.getByText("Couldn't refresh tools.")).toBeTruthy();
    expect(screen.getByText("Voting is temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Source for VS Code/ }).getAttribute("href")).toBe("https://code.visualstudio.com/docs");
    expect(listedNames()).toHaveLength(4);
  });
});
