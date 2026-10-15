import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminState } from "../shared/types";
import Admin from "../src/pages/Admin";
import { api, ApiError } from "../src/lib/api";
import { boardFixture, publicMember } from "./helpers/fixtures";

vi.mock("../src/lib/api", async (original) => ({
  ...await original<typeof import("../src/lib/api")>(),
  api: { adminSession: vi.fn(), adminSignOut: vi.fn(), adminState: vi.fn(), adminAction: vi.fn(), adminTools: vi.fn() },
}));
vi.mock("../src/components/board/tool-moderation", () => ({ ToolModeration: () => <p>Tool review queue</p> }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
const profile = { id: 1, login: "organiser", avatarUrl: "" };
let state: AdminState;

beforeEach(() => {
  sessionStorage.clear();
  const board = boardFixture();
  state = {
    config: { invite: board.invite, weights: board.weights },
    members: [{
      ...publicMember({ nickname: "A".repeat(24), login: "developer-with-a-long-github-username", rank: 4, score: 1_234_567 }),
      whatsapp: "+447700900123", hidden: false, createdAt: Date.now(), statsUpdatedAt: Date.now(),
    }],
  };
  vi.mocked(api.adminSession).mockReset().mockResolvedValue({ configured: true, profile });
  vi.mocked(api.adminSignOut).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(api.adminState).mockReset().mockResolvedValue(state);
  vi.mocked(api.adminAction).mockReset();
  vi.mocked(api.adminTools).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  sessionStorage.clear();
});

function renderAdmin(path = "/admin") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Admin /></MemoryRouter></QueryClientProvider>);
  return { client, ...view };
}

describe("Admin access and management", () => {
  it("shows GitHub sign-in without requesting private data or using a stored legacy secret", async () => {
    sessionStorage.setItem("devechleon:admin", "old-secret");
    vi.mocked(api.adminSession).mockResolvedValue({ configured: true, profile: null });
    renderAdmin("/admin?signin=admin_forbidden");
    expect((await screen.findByRole("link", { name: "Continue with GitHub" })).getAttribute("href")).toBe("/api/auth-start?returnTo=%2Fadmin");
    expect(screen.getByRole("alert").textContent).toContain("doesn't have admin access");
    expect(api.adminState).not.toHaveBeenCalled();
    expect(api.adminTools).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("devechleon:admin")).toBeNull();
  });

  it("keeps admin disabled until it is configured and offers recovery from an access-check failure", async () => {
    vi.mocked(api.adminSession).mockRejectedValueOnce(new Error("Connection unavailable")).mockResolvedValue({ configured: false, profile: null });
    renderAdmin();
    expect((await screen.findByRole("alert")).textContent).toBe("Connection unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/Admin access hasn't been set up/);
    expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
    expect(api.adminState).not.toHaveBeenCalled();
  });

  it("hides and restores members, then clears private data and cached queries on sign-out", async () => {
    const { client } = renderAdmin();
    const user = userEvent.setup();
    const name = state.members[0].nickname;
    const hide = await screen.findByRole("button", { name: `Hide ${name}` });
    const row = hide.closest("li")!;
    expect(within(row).getByText("+447700900123")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "@developer-with-a-long-github-username" }).getAttribute("href")).toBe("https://github.com/developer-with-a-long-github-username");
    const hidden = { ...state, members: [{ ...state.members[0], hidden: true }] };
    vi.mocked(api.adminAction).mockResolvedValueOnce(hidden).mockResolvedValueOnce(state);
    await user.click(hide);
    expect(api.adminAction).toHaveBeenCalledWith({ action: "hide", login: state.members[0].login });
    await user.click(await screen.findByRole("button", { name: `Show ${name}` }));
    expect(api.adminAction).toHaveBeenLastCalledWith({ action: "unhide", login: state.members[0].login });
    await screen.findByRole("button", { name: `Hide ${name}` });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(api.adminSignOut).toHaveBeenCalled();
    expect(screen.queryByText("+447700900123")).toBeNull();
    expect(client.getQueryData(["admin", "state"])).toBeUndefined();
    expect(client.getQueryData(["admin", "tools"])).toBeUndefined();
  });

  it("searches members and requires confirmation before removing one", async () => {
    renderAdmin();
    const user = userEvent.setup();
    const search = await screen.findByRole("searchbox", { name: "Search members" });
    await user.type(search, "missing person");
    await screen.findByText("No members match these filters.");
    await user.clear(search);
    await user.type(search, "900123");
    const remove = screen.getByRole("button", { name: `Remove ${state.members[0].nickname}` });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(remove);
    expect(api.adminAction).not.toHaveBeenCalled();
    vi.mocked(api.adminAction).mockResolvedValue({ ...state, members: [] });
    await user.click(remove);
    await screen.findByText("No one has registered yet.");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.adminAction).toHaveBeenCalledWith({ action: "remove", login: state.members[0].login });
  });

  it("saves edited invite settings and ranking weights", async () => {
    renderAdmin();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Settings" }));
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
    const invite = screen.getByRole("textbox", { name: "WhatsApp invite link" });
    await user.clear(invite);
    await user.type(invite, "https://chat.whatsapp.com/newgroup");
    const weight = screen.getByRole("spinbutton", { name: "Per star" });
    expect(screen.getByRole("spinbutton", { name: "Per contribution since joining" })).toBeTruthy();
    const upvotes = screen.getByRole("spinbutton", { name: "Points per repo upvote" });
    await user.clear(upvotes);
    await user.type(upvotes, "2");
    await user.clear(weight);
    await user.type(weight, "7");
    vi.mocked(api.adminAction).mockResolvedValueOnce(state);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(api.adminAction).toHaveBeenCalledWith({
      action: "config",
      config: { invite: { ...state.config.invite, url: "https://chat.whatsapp.com/newgroup" }, weights: { ...state.config.weights, stars: 7, upvotes: 2 } },
    }));
  });

  it("removes private data when a session expires during a change", async () => {
    const { client } = renderAdmin();
    vi.mocked(api.adminAction).mockRejectedValue(new ApiError(401, "unauthorized", "Sign in again."));
    await userEvent.click(await screen.findByRole("button", { name: `Hide ${state.members[0].nickname}` }));
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(screen.queryByText("+447700900123")).toBeNull();
    expect(client.getQueryData(["admin", "state"])).toBeUndefined();
  });
});
