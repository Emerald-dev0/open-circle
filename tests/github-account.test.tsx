import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubAccount } from "../src/components/github-account";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { COMMUNITY_KEY } from "../src/hooks/use-community";
import { api } from "../src/lib/api";
import type { CommunityState } from "../shared/community";
import { toast } from "sonner";

vi.mock("../src/lib/api", async (original) => ({ ...await original<typeof import("../src/lib/api")>(), api: { community: vi.fn(), signOut: vi.fn() } }));
const clients: QueryClient[] = [];
const initial: CommunityState = { tools: [], counts: {}, voted: [], toolVotes: { "tool:devdocs": 1 }, signInAvailable: true, profile: { id: 1, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" } };

function mount(state = initial) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(COMMUNITY_KEY, state);
  render(<QueryClientProvider client={client}><TooltipProvider><GitHubAccount /></TooltipProvider></QueryClientProvider>);
  return client;
}

beforeEach(() => { vi.mocked(api.community).mockReset(); vi.mocked(api.signOut).mockReset(); vi.mocked(toast.error).mockClear(); });
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("Global GitHub account controls", () => {
  it("opens the avatar menu on first visit with the full username, Portfolio and Log out", () => {
    const login = "a".repeat(39);
    mount({ ...initial, profile: { ...initial.profile!, login } });
    const group = screen.getByRole("group", { name: "GitHub account" });
    const avatar = within(group).getByRole("button", { name: `Account menu for @${login}` });
    expect(avatar.getAttribute("aria-expanded")).toBe("true");
    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(initial.profile!.avatarUrl);
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText(`@${login}`).getAttribute("title")).toBe(`@${login}`);
    expect(within(menu).getByRole("menuitem", { name: "Portfolio" }).getAttribute("href")).toBe("/portfolio");
    expect(within(menu).getByRole("menuitem", { name: "Sign out of GitHub" })).toBeTruthy();
  });

  it("stays closed once seen and toggles from the avatar", async () => {
    localStorage.setItem("opencircle:account-menu-seen", "1");
    mount();
    const avatar = screen.getByRole("button", { name: "Account menu for @octocat" });
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.setup().click(avatar);
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy();
  });

  it("revokes sign-in and clears personal vote selections from the shared cache", async () => {
    vi.mocked(api.signOut).mockResolvedValue({ ok: true });
    vi.mocked(api.community).mockResolvedValue({ ...initial, profile: null, toolVotes: {} });
    const client = mount();
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Sign out of GitHub" }));
    await screen.findByRole("link", { name: "Sign in to vote" });
    expect(api.signOut).toHaveBeenCalledOnce();
    expect(client.getQueryData<CommunityState>(COMMUNITY_KEY)?.toolVotes).toEqual({});
    expect(screen.queryByRole("group", { name: "GitHub account" })).toBeNull();
  });

  it("preserves the profile and reports a failed sign-out", async () => {
    vi.mocked(api.signOut).mockRejectedValue(new Error("offline"));
    vi.mocked(api.community).mockResolvedValue(initial);
    mount();
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Sign out of GitHub" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't sign out. Please try again."));
    expect(screen.getByRole("group", { name: "GitHub account" })).toBeTruthy();
  });

  it("shows sign-in when signed out", () => {
    mount({ ...initial, profile: null });
    expect(screen.getByRole("link", { name: "Sign in to vote" }).getAttribute("href")).toBe("/api/auth-start");
  });
});
