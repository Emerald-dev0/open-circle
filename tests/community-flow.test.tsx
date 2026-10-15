import { createHash } from "node:crypto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getCommunity } from "../api/community";
import { POST as postVote } from "../api/vote";
import { GET as getAdminTools, PATCH as approveTool, POST as postTool } from "../api/tools";
import { createAdminSession } from "../server/admin-session";
import { readBoard, rebuildBoard } from "../server/board";
import { MemoryCommunityStore } from "../server/community-memory";
import { HttpError, json } from "../server/http";
import Index from "../src/pages/Index";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { ToolModeration } from "../src/components/board/tool-moderation";
import { BOARD_KEY } from "../src/hooks/use-board";
import { CURATED_TOOLS } from "../shared/tools";
import { memberRecord } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const context = vi.hoisted(() => ({ board: null as unknown, community: null as unknown }));
vi.mock("../server/db", () => ({ getStore: () => context.board }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => context.community }));

let board: TestStore;
let community: MemoryCommunityStore;
let cookie: string;
const clients: QueryClient[] = [];

async function renderPage(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(BOARD_KEY, await readBoard(board));
  return { client, ...render(<QueryClientProvider client={client}><MotionConfig reducedMotion="always"><TooltipProvider><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Index /></MemoryRouter></TooltipProvider></MotionConfig></QueryClientProvider>) };
}

beforeEach(async () => {
  board = new TestStore();
  community = new MemoryCommunityStore(null);
  context.board = board;
  context.community = community;
  const token = "a".repeat(64);
  await community.createSession(createHash("sha256").update(token).digest("hex"), { id: 1, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/1" }, Date.now() + 60_000);
  cookie = `opencircle_github=${token}`;
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "https://opencircle.test/api/auth-callback");
  vi.stubEnv("ADMIN_GITHUB_IDS", "1");
  cookie += `; ${(await createAdminSession(new Request("https://opencircle.test/api/admin"), community, { id: 1, login: "octocat", avatarUrl: "" })).split(";", 1)[0]}`;
  await board.createMember(memberRecord());
  await rebuildBoard(board);
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const request = new Request(new URL(path, "https://opencircle.test"), {
      method: init?.method,
      body: init?.body,
      headers: { "content-type": "application/json", cookie, origin: "https://opencircle.test", "x-vercel-forwarded-for": "203.0.113.20", ...init?.headers },
    });
    const response = path === "/api/board" ? json(await readBoard(board))
      : path === "/api/community" ? await getCommunity(request)
        : path === "/api/vote" ? await postVote(request)
          : path === "/api/tools" ? init?.method === "PATCH" ? await approveTool(request) : init?.method === "POST" ? await postTool(request) : await getAdminTools(request)
            : (() => { throw new Error(`Unexpected request ${path}`); })();
    if (response.headers.has("set-cookie")) cookie += `; ${response.headers.get("set-cookie")!.split(";", 1)[0]}`;
    return response;
  }));
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("Community interface through real API handlers", () => {
  it("keeps votes through page reloads, shares tools and saves them while navigating the live tabs", async () => {
    const user = userEvent.setup();
    const page = await renderPage("/repositories");
    const upvote = await screen.findByRole("button", { name: "Upvote Octocat/open-kit" });
    await waitFor(() => expect((upvote as HTMLButtonElement).disabled).toBe(false));
    await user.click(upvote);
    await screen.findByRole("button", { name: "Remove upvote from Octocat/open-kit" });
    expect((await community.readVotes("not-this-visitor")).counts["repo:R_open-kit"]).toBe(1);

    await user.click(screen.getByRole("tab", { name: /^Tools/ }));
    expect(await screen.findByRole("tab", { name: `Tools ${CURATED_TOOLS.length}` })).toBeTruthy();
    await screen.findByRole("link", { name: /^Excalidraw / });
    await user.click(screen.getByRole("button", { name: "Share a tool" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Community Kit");
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://community-kit.dev");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "A collection of utilities for the circle.");
    await user.click(screen.getByRole("button", { name: "Share tool" }));
    await screen.findByText(/^Sent to admins for review\./);
    expect(screen.queryByRole("link", { name: /^Community Kit / })).toBeNull();
    const [tool] = await community.listTools();
    expect(tool).toMatchObject({ name: "Community Kit", url: "https://community-kit.dev/", source: "community", status: "pending" });
    const admin = render(<QueryClientProvider client={page.client}><ToolModeration /></QueryClientProvider>);
    await user.click(await screen.findByRole("button", { name: "Approve Community Kit" }));
    await screen.findByRole("link", { name: /^Community Kit / });
    expect((await community.listTools())[0].status).toBe("approved");
    admin.unmount();
    await user.click(screen.getByRole("button", { name: "Upvote Community Kit" }));
    await screen.findByRole("button", { name: "Remove upvote for Community Kit" });
    await user.click(screen.getByRole("button", { name: "Downvote Community Kit" }));
    await screen.findByRole("button", { name: "Remove downvote for Community Kit" });
    await user.click(screen.getByRole("button", { name: "Save Community Kit" }));
    expect(screen.queryByRole("button", { name: "Saved only" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Tools" })).getByRole("button", { name: "Unsave Community Kit" }).getAttribute("aria-pressed")).toBe("true");
    expect((await community.readProfileVotes(null)).counts[`tool:${tool.id}`]).toBe(-1);

    page.unmount();
    await renderPage("/repositories");
    const remove = await screen.findByRole("button", { name: "Remove upvote from Octocat/open-kit" });
    await waitFor(() => expect((remove as HTMLButtonElement).disabled).toBe(false));
    await user.click(remove);
    await screen.findByRole("button", { name: "Upvote Octocat/open-kit" });
    expect((await community.readVotes("not-this-visitor")).counts["repo:R_open-kit"]).toBeUndefined();
    expect((await board.getBoard())?.repositories[0].stars).toBe(10);
  });

  it("shows a storage failure without inventing an upvote and permits retrying", async () => {
    const user = userEvent.setup();
    await renderPage("/repositories");
    const upvote = await screen.findByRole("button", { name: "Upvote Octocat/open-kit" });
    await waitFor(() => expect((upvote as HTMLButtonElement).disabled).toBe(false));
    vi.spyOn(community, "setVote").mockRejectedValueOnce(new HttpError(503, "storage_unavailable", "Votes cannot be saved right now."));
    await user.click(upvote);
    expect((await screen.findByRole("alert")).textContent).toBe("Votes cannot be saved right now.");
    expect((await community.readVotes("anyone")).counts).toEqual({});
    await waitFor(() => expect((upvote as HTMLButtonElement).disabled).toBe(false));
    await user.click(upvote);
    await screen.findByRole("button", { name: "Remove upvote from Octocat/open-kit" });
    expect((await community.readVotes("anyone")).counts["repo:R_open-kit"]).toBe(1);
  });
});
