import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommunityTool, VoteValue } from "../shared/community";
import { ToolRow } from "../src/components/board/tool-row";
import { TooltipProvider } from "../src/components/ui/tooltip";

const name = "A".repeat(60);
const tool: CommunityTool = {
  id: "long-tool", name, description: "Documentation ".repeat(16),
  url: "https://devdocs.io/", sourceUrl: "https://devdocs.io/about",
  category: "Learning", source: "curated", status: "approved", createdAt: 100,
};

describe("Tool row controls with long content", () => {
  it("keeps the full links, large vote count, voting and saved state attached to the same tool", async () => {
    const vote = vi.fn();
    function Harness() {
      const [value, setValue] = useState<VoteValue>(0);
      const [saved, setSaved] = useState(false);
      return <TooltipProvider><ul><ToolRow tool={tool} count={1_234_567} value={value} saved={saved} disabled={false} onVote={(next) => { vote(next); setValue(next); }} onSave={() => setSaved(!saved)} /></ul></TooltipProvider>;
    }
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.getByRole("link", { name: `${name} (opens in a new tab)` }).getAttribute("href")).toBe(tool.url);
    expect(screen.getByRole("link", { name: `Source for ${name} (opens in a new tab)` }).getAttribute("href")).toBe(tool.sourceUrl);
    const controls = screen.getByRole("group", { name: `Vote on ${name}` });
    expect(within(controls).getByTitle("1,234,567 net votes").textContent).toBe("1.2M");
    await user.click(screen.getByRole("button", { name: `Upvote ${name}` }));
    expect(vote).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: `Remove upvote for ${name}` }));
    expect(vote).toHaveBeenLastCalledWith(0);
    await user.click(screen.getByRole("button", { name: `Downvote ${name}` }));
    expect(vote).toHaveBeenLastCalledWith(-1);
    await user.click(screen.getByRole("button", { name: `Save ${name}` }));
    expect(screen.getByRole("button", { name: `Unsave ${name}` }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("One vote per tool in this browser.")).toBeNull();
  });

  it("keeps links and bookmarks usable when tool voting is unavailable", async () => {
    const vote = vi.fn();
    const save = vi.fn();
    render(<TooltipProvider><ul><ToolRow tool={tool} count={0} value={0} saved={false} disabled onVote={vote} onSave={save} /></ul></TooltipProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `Upvote ${name}` }));
    await user.click(screen.getByRole("button", { name: `Downvote ${name}` }));
    expect(vote).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: `Save ${name}` }));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: `${name} (opens in a new tab)` })).toBeTruthy();
  });
});
