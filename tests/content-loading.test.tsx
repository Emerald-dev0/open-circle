import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Community from "../src/pages/Community";
import Events from "../src/pages/Events";
import Portfolio from "../src/pages/Portfolio";
import PublicPortfolio from "../src/pages/PublicPortfolio";
import AdminForum from "../src/components/forum/admin-forum";
import AdminEvents from "../src/components/events/admin-events";
import AdminBotSettings from "../src/components/admin-bot-settings";
import { LegacyHelp } from "../src/components/forum/legacy-help";
import { RepositoryPicker } from "../src/components/portfolio/editor-fields";
import { api } from "../src/lib/api";
import { forumApi } from "../src/lib/forum-api";
import { eventsApi } from "../src/lib/events-api";
import { portfolioApi } from "../src/lib/portfolio-api";
import { COMMUNITY_KEY } from "../src/hooks/use-community";
import type { CommunityState } from "../shared/community";
import type { ForumPage } from "../shared/forum";

vi.mock("../src/components/account-corner", () => ({ AccountCorner: () => null }));
vi.mock("../src/components/dock", () => ({ Dock: () => null }));

const clients: QueryClient[] = [];
const profile = { id: 42, login: "Alice", avatarUrl: "" };
const community: CommunityState = { profile, tools: [], counts: {}, voted: [], toolVotes: {}, signInAvailable: true };
const emptyForum: ForumPage = { items: [], total: 0, page: 1, pageSize: 15 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount(children: ReactNode, path = "/community", signedIn = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  if (signedIn) client.setQueryData(COMMUNITY_KEY, community);
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/community/:id" element={children} /><Route path="/events/:slug" element={children} /><Route path="*" element={children} /></Routes></MemoryRouter></QueryClientProvider>) };
}

function skeleton(label: string) {
  const status = screen.getByRole("status", { name: label });
  expect(status.getAttribute("aria-busy")).toBe("true");
  expect(status.querySelector(".lr-skeleton")).toBeTruthy();
  expect(status.querySelector("[data-loading-template][inert]")).toBeTruthy();
  expect(status.querySelector(".sr-only")?.textContent).toBe(label);
  expect(status.querySelector("button, input, img, a")).toBeNull();
}

beforeEach(() => {
  vi.spyOn(api, "community").mockResolvedValue(community);
  vi.spyOn(forumApi, "list").mockResolvedValue(emptyForum);
  vi.spyOn(eventsApi, "list").mockResolvedValue({ events: [], storageConfigured: true });
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it.each(["community", "events"])("uses a skeleton while checking %s access without requesting private content", async (page) => {
  const session = deferred<CommunityState>();
  vi.mocked(api.community).mockReturnValue(session.promise);
  mount(page === "community" ? <Community /> : <Events />, `/${page}`, false);
  skeleton("Checking sign-in…");
  expect(forumApi.list).not.toHaveBeenCalled();
  expect(eventsApi.list).not.toHaveBeenCalled();
  await act(async () => session.resolve({ ...community, profile: null }));
  await screen.findByRole("link", { name: "Sign in with GitHub" });
  expect(screen.queryByRole("status", { name: "Checking sign-in…" })).toBeNull();
  expect(forumApi.list).not.toHaveBeenCalled();
  expect(eventsApi.list).not.toHaveBeenCalled();
});

it("keeps Community filters usable, recovers after a failed load and preserves results during refresh", async () => {
  const initial = deferred<ForumPage>();
  vi.mocked(forumApi.list).mockReturnValue(initial.promise);
  const { client } = mount(<Community />);
  skeleton("Loading community…");
  expect(screen.getByRole("searchbox", { name: "Search community" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Questions" })).toBeTruthy();
  await act(async () => initial.reject(new Error("Community is unavailable. Try again.")));
  await screen.findByRole("alert");
  expect(screen.queryByRole("status", { name: "Loading community…" })).toBeNull();
  vi.mocked(forumApi.list).mockResolvedValue(emptyForum);
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No posts found. Try another filter or come back later.");
  const refresh = deferred<ForumPage>();
  vi.mocked(forumApi.list).mockReturnValue(refresh.promise);
  await act(async () => { void client.invalidateQueries({ queryKey: ["forum"] }); });
  expect(screen.queryByRole("status", { name: "Loading community…" })).toBeNull();
  expect(screen.getByText("No posts found. Try another filter or come back later.")).toBeTruthy();
  await act(async () => refresh.resolve(emptyForum));
});

it.each(["community", "events"])("loads a %s detail with a skeleton and exposes failures", async (page) => {
  const detail = deferred<never>();
  if (page === "community") vi.spyOn(forumApi, "detail").mockReturnValue(detail.promise);
  else vi.spyOn(eventsApi, "detail").mockReturnValue(detail.promise);
  mount(page === "community" ? <Community /> : <Events />, `/${page}/test-post`);
  skeleton(page === "community" ? "Loading community…" : "Loading events…");
  await act(async () => detail.reject(new Error("This post could not be loaded.")));
  await screen.findByRole("alert");
  expect(screen.queryByRole("status", { name: /Loading/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

it("shows event placeholders until the list arrives and keeps the schedule during background refresh", async () => {
  const list = deferred<Awaited<ReturnType<typeof eventsApi.list>>>();
  vi.mocked(eventsApi.list).mockReturnValue(list.promise);
  const { client } = mount(<Events />, "/events");
  skeleton("Loading events…");
  await act(async () => list.resolve({ events: [] }));
  await screen.findByRole("tab", { name: "Upcoming" });
  const refresh = deferred<Awaited<ReturnType<typeof eventsApi.list>>>();
  vi.mocked(eventsApi.list).mockReturnValue(refresh.promise);
  await act(async () => { void client.invalidateQueries({ queryKey: ["events"] }); });
  expect(screen.queryByRole("status", { name: "Loading events…" })).toBeNull();
  expect(screen.getByRole("status", { name: "No upcoming events" })).toBeTruthy();
  await act(async () => refresh.resolve({ events: [] }));
});

it.each(["community", "events"])("uses skeletons in admin %s until its queue arrives", async (page) => {
  const list = deferred<never>();
  if (page === "community") vi.mocked(forumApi.list).mockReturnValue(list.promise);
  else vi.mocked(eventsApi.list).mockReturnValue(list.promise);
  mount(page === "community" ? <AdminForum profile={profile} onUnauthorized={vi.fn()} /> : <AdminEvents onUnauthorized={vi.fn()} />, "/admin");
  skeleton(page === "community" ? "Loading community moderation…" : "Loading events…");
  await act(async () => list.reject(new Error("Queue is unavailable.")));
  await screen.findByRole("alert");
  expect(screen.queryByRole("status", { name: /Loading/ })).toBeNull();
});

it("renders earlier help and bot settings as visible skeletons while their requests wait", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  mount(<><LegacyHelp profileId={profile.id} login={profile.login} /><AdminBotSettings onUnauthorized={vi.fn()} /></>);
  skeleton("Loading earlier help requests…");
  skeleton("Loading bot settings…");
});

it("keeps repository search usable while loading and replaces the skeleton with the empty result", async () => {
  const list = deferred<Awaited<ReturnType<typeof portfolioApi.repositories>>>();
  vi.spyOn(portfolioApi, "repositories").mockReturnValue(list.promise);
  mount(<RepositoryPicker ownerId={profile.id} selected={[]} onSelect={vi.fn()} />, "/portfolio");
  expect(portfolioApi.repositories).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /Choose repositories/ }));
  skeleton("Loading your repositories…");
  await userEvent.type(screen.getByRole("textbox", { name: "Search loaded repositories" }), "typescript");
  await act(async () => list.resolve({ repositories: [], nextPage: null }));
  await screen.findByText("No matching repositories on the loaded pages.");
  expect(screen.queryByRole("status", { name: "Loading your repositories…" })).toBeNull();
});

it.each(["public", "editor"])("uses the shared minimal skeleton for the %s portfolio and keeps error recovery", async (page) => {
  const pending = deferred<never>();
  if (page === "public") vi.spyOn(portfolioApi, "public").mockReturnValue(pending.promise);
  else vi.spyOn(portfolioApi, "editor").mockReturnValue(pending.promise);
  mount(page === "public" ? <PublicPortfolio slug="alice" /> : <Portfolio />, "/portfolio");
  skeleton(page === "public" ? "Loading portfolio…" : "Loading your portfolio…");
  await act(async () => pending.reject(new Error("Portfolio could not be loaded.")));
  await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
  expect(screen.queryByRole("status", { name: /Loading/ })).toBeNull();
});
