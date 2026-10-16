import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { RepositoryExplorer } from "../src/components/board/repository-explorer";
import { repository } from "./helpers/fixtures";

const hooks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/hooks/use-community", () => ({
  GITHUB_SIGN_OUT_KEY: ["github-sign-out"],
  useCommunity: () => ({ data: { counts: {}, voted: [], profile: null, signInAvailable: false }, isPending: false, error: null }),
  useCommunityVote: () => ({ mutate: hooks.mutate, isPending: false, error: null }),
}));

it("finds the organization repo by OpenCircle, displays its real metadata and keeps save and vote actions", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const official = { ...repository({ id: "R_community", name: "open-circle", fullName: "opencirclehq/open-circle", url: "https://github.com/opencirclehq/open-circle", stars: 30, forks: 4 }), rank: 1, ownerLogin: "opencirclehq", ownerNickname: "OpenCircle", ownerAvatarUrl: "" };
  const personal = { ...repository(), rank: 2, ownerLogin: "Octocat", ownerNickname: "Octo", ownerAvatarUrl: "" };
  render(<QueryClientProvider client={client}><RepositoryExplorer repositories={[official, personal]} /></QueryClientProvider>);
  const user = userEvent.setup();
  await user.type(screen.getByRole("searchbox", { name: "Search spotlight repos" }), "OpenCircle");
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 spotlight repos"));
  expect(screen.getByRole("link", { name: "open-circle (opens in a new tab)" }).getAttribute("href")).toBe(official.url);
  expect(screen.getByText("@opencirclehq")).toBeTruthy();
  expect(screen.getByText("TypeScript")).toBeTruthy();
  expect(screen.getByLabelText("4 forks")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save opencirclehq/open-circle" }));
  expect(screen.getByRole("button", { name: "Unsave opencirclehq/open-circle" }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: "Upvote opencirclehq/open-circle" }));
  expect(hooks.mutate).toHaveBeenCalledWith({ target: "repo:R_community", active: true });
  client.clear();
});
