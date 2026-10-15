import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ToolModeration } from "../src/components/board/tool-moderation";
import { api } from "../src/lib/api";
import type { CommunityTool } from "../shared/community";

vi.mock("../src/lib/api", async (original) => ({ ...await original<typeof import("../src/lib/api")>(), api: { adminTools: vi.fn(), approveTool: vi.fn(), removeTool: vi.fn() } }));
let client: QueryClient;
afterEach(() => client?.clear());

it("paginates the review queue, updates a later-page item and resets after status filtering", async () => {
  let tools: CommunityTool[] = Array.from({ length: 41 }, (_, index) => ({ id: `tool-${index}`, name: `Tool ${String(index).padStart(2, "0")}`, url: `https://example.test/${index}`, description: "A useful tool.", category: "Development", source: "community", status: "pending", createdAt: index }));
  vi.mocked(api.adminTools).mockImplementation(async () => tools);
  vi.mocked(api.removeTool).mockImplementation(async (id) => { tools = tools.filter((tool) => tool.id !== id); return { ok: true }; });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ToolModeration /></QueryClientProvider>);
  const nav = () => within(screen.getByRole("navigation", { name: "Tool review pagination" }));
  await screen.findByRole("list", { name: "Tool review" });
  const user = userEvent.setup();
  expect(within(screen.getByRole("list", { name: "Tool review" })).getAllByRole("listitem")).toHaveLength(20);
  await user.click(nav().getByRole("button", { name: "Go to page 3" }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Reject Tool 40" }));
  await waitFor(() => expect(nav().getByRole("status").textContent).toBe("21–40 of 40"));
  expect(api.removeTool).toHaveBeenCalledWith("tool-40");
  expect(screen.getByRole("button", { name: "Approve Tool 20" })).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "Tool status" }));
  await user.click(screen.getByRole("option", { name: "Approved" }));
  expect(screen.queryByRole("navigation", { name: "Tool review pagination" })).toBeNull();
  expect(screen.getByText("No tools match this filter.")).toBeTruthy();
  await user.click(screen.getByRole("combobox", { name: "Tool status" }));
  await user.click(screen.getByRole("option", { name: "All tools" }));
  expect(screen.getByRole("button", { name: "Approve Tool 00" })).toBeTruthy();
});
