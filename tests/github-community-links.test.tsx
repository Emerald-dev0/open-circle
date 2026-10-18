import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { GitHubCommunityLinks } from "@/components/github-community-links";

const clients: QueryClient[] = [];

function mount(client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })) {
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><GitHubCommunityLinks /></QueryClientProvider>) };
}

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it("keeps the GitHub destinations, live counts and keyboard focus in shared textured links", async () => {
  vi.mocked(fetch).mockImplementation(async (url) => new Response(JSON.stringify(
    String(url).includes("/repos/") ? { stargazers_count: 30 } : { followers: 14 },
  )));
  const { container } = mount();
  const star = screen.getByRole("link", { name: "Star OpenCircle on GitHub" });
  const follow = screen.getByRole("link", { name: "Follow @opencirclehq on GitHub" });
  await screen.findByTitle("30 stars");
  await screen.findByTitle("14 followers");
  expect(star.getAttribute("href")).toBe("https://github.com/opencirclehq/open-circle");
  expect(follow.getAttribute("href")).toBe("https://github.com/opencirclehq");
  for (const link of [star, follow]) {
    expect(link.classList.contains("touch-target")).toBe(true);
    expect(link.classList.contains("rounded-full")).toBe(true);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  }
  expect(container.querySelector("iframe")).toBeNull();
  await userEvent.tab();
  expect(document.activeElement).toBe(star);
  await userEvent.tab();
  expect(document.activeElement).toBe(follow);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.credentials === "omit")).toBe(true);
});

it("keeps links available while counts load and distinguishes a confirmed zero", async () => {
  const pending: Array<(value: Response) => void> = [];
  vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
  mount();
  expect(screen.getByTitle("Star count loading").firstElementChild?.textContent).toBe("—");
  expect(screen.getByTitle("Follower count loading").firstElementChild?.textContent).toBe("—");
  expect(screen.getAllByRole("link")).toHaveLength(2);
  await act(async () => pending.forEach((resolve) => resolve(new Response(JSON.stringify({ stargazers_count: 0, followers: 0 })))));
  expect((await screen.findByTitle("0 stars")).firstElementChild?.textContent).toBe("0");
  expect((await screen.findByTitle("0 followers")).firstElementChild?.textContent).toBe("0");
});

it("isolates GitHub failures and keeps the working counter without retrying rate limits", async () => {
  vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/repos/")
    ? new Response("Rate limited", { status: 403 })
    : new Response(JSON.stringify({ followers: 14 })));
  mount();
  expect((await screen.findByTitle("Star count unavailable")).firstElementChild?.textContent).toBe("—");
  await screen.findByTitle("14 followers");
  expect(screen.getByRole("link", { name: "Star OpenCircle on GitHub" }).getAttribute("href")).toContain("open-circle");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([null, {}, { stargazers_count: -1 }, { stargazers_count: "30" }])("rejects malformed GitHub counters: %j", async (body) => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
  mount();
  await screen.findByTitle("Star count unavailable");
  await screen.findByTitle("Follower count unavailable");
  expect(screen.getAllByRole("link")).toHaveLength(2);
});

it("reuses fresh counts on remount and retains confirmed counts when a refresh fails", async () => {
  vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ stargazers_count: 12345, followers: 14 })));
  const view = mount();
  const count = await screen.findByTitle("12,345 stars");
  expect(count.firstElementChild?.textContent).toBe("12.3K");
  view.unmount();
  mount(view.client);
  await screen.findByTitle("12,345 stars");
  expect(fetch).toHaveBeenCalledTimes(2);
  vi.mocked(fetch).mockRejectedValue(new Error("Offline"));
  await act(async () => view.client.refetchQueries({ queryKey: ["github-community-count"] }));
  await waitFor(() => expect(screen.getByTitle("12,345 stars").firstElementChild?.textContent).toBe("12.3K"));
  expect(screen.getByTitle("14 followers").firstElementChild?.textContent).toBe("14");
});
