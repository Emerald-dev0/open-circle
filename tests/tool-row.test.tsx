import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommunityTool } from "../shared/community";
import { ToolRow } from "../src/components/board/tool-row";
import { TooltipProvider } from "../src/components/ui/tooltip";

const tool: CommunityTool = {
  id: "docs",
  name: "DevDocs",
  url: "https://devdocs.io/javascript?search=private-query#guide",
  description: "Search programming documentation.",
  category: "Learning",
  source: "curated",
  status: "approved",
  createdAt: 0,
};

function row(currentTool = tool, onVote = vi.fn(), onSave = vi.fn()) {
  return <TooltipProvider><ul><ToolRow tool={currentTool} count={3} value={0} saved={false} disabled={false} onVote={onVote} onSave={onSave} /></ul></TooltipProvider>;
}

describe("Tool row favicons", () => {
  it("shows the website icon beside its name without sharing the page path or changing its accessible link", () => {
    render(row());
    const link = screen.getByRole("link", { name: "DevDocs (opens in a new tab)" });
    const icon = link.querySelector("img")!;
    const source = new URL(icon.src);
    expect(link.getAttribute("href")).toBe(tool.url);
    expect(source.searchParams.get("domain")).toBe("devdocs.io");
    expect(icon.src).not.toContain("private-query");
    expect(icon.alt).toBe("");
    expect(icon.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
  });

  it("replaces a failed icon with a globe and tries the favicon again when the website changes", () => {
    const view = render(row());
    const link = screen.getByRole("link", { name: "DevDocs (opens in a new tab)" });
    fireEvent.error(link.querySelector("img")!);
    expect(link.querySelector("img")).toBeNull();
    expect(link.firstElementChild?.querySelector("svg")).toBeTruthy();
    view.rerender(row({ ...tool, url: "https://example.com/tools" }));
    expect(new URL(link.querySelector("img")!.src).searchParams.get("domain")).toBe("example.com");
  });

  it("keeps voting and saving available when the website icon fails", async () => {
    const onVote = vi.fn();
    const onSave = vi.fn();
    render(row(tool, onVote, onSave));
    fireEvent.error(screen.getByRole("link", { name: "DevDocs (opens in a new tab)" }).querySelector("img")!);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Upvote DevDocs" }));
    await user.click(screen.getByRole("button", { name: "Downvote DevDocs" }));
    await user.click(screen.getByRole("button", { name: "Save DevDocs" }));
    expect(onVote.mock.calls).toEqual([[1], [-1]]);
    expect(onSave).toHaveBeenCalledOnce();
  });
});
