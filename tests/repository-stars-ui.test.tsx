import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RepositoryExplorer } from "../src/components/board/repository-explorer";
import { useGitHubSignOut } from "../src/hooks/use-community";
import type { CommunityState } from "../shared/community";
import { repository } from "./helpers/fixtures";

const repo = { ...repository(), rank: 1, ownerLogin: "Octocat", ownerNickname: "Octo", ownerAvatarUrl: "" };
let community: CommunityState;
let starred: boolean;
let client: QueryClient;
let requests: ReturnType<typeof vi.fn>;
let finish: ((response: Response) => void) | undefined;
let delayMutation: boolean;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}><MotionConfig reducedMotion="always">{children}</MotionConfig></QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  community = { tools: [], counts: {}, voted: [], signInAvailable: true, profile: { id: 1, login: "octocat", avatarUrl: "", starsConnected: true } };
  starred = false;
  delayMutation = false;
  finish = undefined;
  requests = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/community") return Response.json(community);
    if (path === "/api/auth") {
      community = { ...community, profile: null };
      return Response.json({ ok: true });
    }
    if (path.startsWith("/api/repository-stars")) {
      if (init?.method === "POST") {
        if (delayMutation) return new Promise<Response>((resolve) => { finish = resolve; });
        starred = JSON.parse(String(init.body)).active;
        return Response.json({ id: repo.id, starred, stars: starred ? 11 : 10 });
      }
      return Response.json({ connected: true, repositories: [{ id: repo.id, starred, stars: starred ? 11 : 10 }] });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  vi.stubGlobal("fetch", requests);
});

afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

it.each([null, { id: 1, login: "octocat", avatarUrl: "" }])("explains GitHub permission before connecting for profile %s", async (profile) => {
  community.profile = profile;
  render(<RepositoryExplorer repositories={[repo]} />, { wrapper });
  const button = await screen.findByRole("button", { name: "Star Octocat/open-kit on GitHub" });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(within(button).getByText("Star")).toBeTruthy();
  await userEvent.setup().click(button);
  expect(screen.getByRole("dialog", { name: "Enable GitHub stars" })).toBeTruthy();
  expect(screen.getByText(/permission also allows changes to public repository code/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Continue with GitHub" }).getAttribute("href")).toBe("/api/auth-start?returnTo=%2Frepositories&stars=1");
  expect(requests.mock.calls.some(([path]) => path.startsWith("/api/repository-stars"))).toBe(false);
  await userEvent.setup().keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(button);
});

it("stars and unstars by keyboard with confirmed counts, and restores the GitHub state after remounting", async () => {
  const view = render(<RepositoryExplorer repositories={[repo]} />, { wrapper });
  const star = await screen.findByRole("button", { name: "Star Octocat/open-kit on GitHub" });
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  expect(star.getAttribute("aria-pressed")).toBe("false");
  star.focus();
  await userEvent.setup().keyboard("{Enter}");
  const unstar = await screen.findByRole("button", { name: "Unstar Octocat/open-kit on GitHub" });
  expect(unstar.getAttribute("aria-pressed")).toBe("true");
  expect(within(unstar).getByText("Starred")).toBeTruthy();
  expect(screen.getByLabelText("11 GitHub stars").textContent).toBe("11");
  expect(JSON.parse(String(requests.mock.calls.find(([, init]) => init?.method === "POST")![1]?.body))).toEqual({ repositoryId: repo.id, active: true });
  view.unmount();
  client.clear();
  render(<RepositoryExplorer repositories={[repo]} />, { wrapper });
  await screen.findByRole("button", { name: "Unstar Octocat/open-kit on GitHub" });
  await userEvent.setup().click(screen.getByRole("button", { name: "Unstar Octocat/open-kit on GitHub" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Star Octocat/open-kit on GitHub" }).getAttribute("aria-pressed")).toBe("false"));
  expect(screen.getByLabelText("10 GitHub stars").textContent).toBe("10");
  expect(requests.mock.calls.some(([path]) => path === "/api/vote")).toBe(false);
});

it("offers the same direct star action on the OpenCircle organization repository", async () => {
  community.profile = null;
  const official = { ...repo, id: "R_kgDOVJ7oBg", name: "open-circle", fullName: "opencirclehq/open-circle", ownerLogin: "opencirclehq", ownerNickname: "OpenCircle", url: "https://github.com/opencirclehq/open-circle", stars: 30 };
  render(<RepositoryExplorer repositories={[official]} />, { wrapper });
  const button = await screen.findByRole("button", { name: "Star opencirclehq/open-circle on GitHub" });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(within(button).getByText("Star")).toBeTruthy();
  expect(within(button).getByLabelText("30 GitHub stars").textContent).toBe("30");
  await userEvent.setup().click(button);
  expect(screen.getByRole("dialog", { name: "Enable GitHub stars" })).toBeTruthy();
  expect(requests.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("prevents duplicate clicks, preserves the previous count on failure and lets the person retry", async () => {
  delayMutation = true;
  render(<RepositoryExplorer repositories={[repo]} />, { wrapper });
  const star = await screen.findByRole("button", { name: "Star Octocat/open-kit on GitHub" });
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  await userEvent.setup().dblClick(star);
  await waitFor(() => expect(star.getAttribute("aria-busy")).toBe("true"));
  expect((star as HTMLButtonElement).disabled).toBe(true);
  expect(requests.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => finish!(Response.json({ error: { code: "github_stars_unavailable", message: "GitHub is unavailable. Try again." } }, { status: 502 })));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(star.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByLabelText("10 GitHub stars").textContent).toBe("10");
  delayMutation = false;
  await waitFor(() => expect((star as HTMLButtonElement).disabled).toBe(false));
  await userEvent.setup().click(star);
  expect(await screen.findByRole("button", { name: "Unstar Octocat/open-kit on GitHub" })).toBeTruthy();
});

it("clears account-specific star state after sign-out", async () => {
  starred = true;
  render(<RepositoryExplorer repositories={[repo]} />, { wrapper });
  await screen.findByRole("button", { name: "Unstar Octocat/open-kit on GitHub" });
  const signOut = renderHook(() => useGitHubSignOut(), { wrapper });
  await act(async () => { await signOut.result.current.mutateAsync(); });
  const star = await screen.findByRole("button", { name: "Star Octocat/open-kit on GitHub" });
  expect(star.hasAttribute("aria-pressed")).toBe(false);
  expect(client.getQueriesData({ queryKey: ["repository-stars", 1] })).toEqual([]);
  await userEvent.setup().click(star);
  expect(screen.getByRole("dialog", { name: "Enable GitHub stars" })).toBeTruthy();
});
