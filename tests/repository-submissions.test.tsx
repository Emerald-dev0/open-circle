import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RepositorySubmissions } from "../src/components/repository-submissions";
import type { RepositorySubmission } from "../shared/coordination";

const repo: RepositorySubmission = { id: "repo_1", owner: "Alice", fullName: "Alice/tool", url: "https://github.com/Alice/tool", license: "MIT", fork: false, summary: "A tool for learning TypeScript.", helpWanted: "Help with tests and documentation.", issues: ["https://github.com/Alice/tool/issues/1"], skills: ["typescript"], tagOwner: true, status: "approved", reason: "", needsHelp: true, createdAt: 1, checkedAt: 1, announcedAt: null, followedUpAt: null, pinStatus: "idle" };

it("sends repo details with explicit permission and optional tagging, and preserves failed drafts", async () => {
  const user = userEvent.setup(); const submit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<RepositorySubmissions repositories={[]} login="Alice" busy={false} submit={submit} />);
  await user.click(screen.getByText("Submit an open-source repo"));
  const url = screen.getByLabelText("GitHub repository link");
  await user.type(url, repo.url); await user.type(screen.getByLabelText("What does it do?"), repo.summary); await user.type(screen.getByLabelText("What help do you need?"), repo.helpWanted);
  await user.type(screen.getByLabelText(/Starter issue links/), repo.issues[0]); await user.type(screen.getByLabelText(/Skills needed/), "typescript, documentation");
  await user.click(screen.getByLabelText(/I maintain this repo/));
  await user.click(screen.getByRole("button", { name: "Submit repo for approval" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1)); expect((url as HTMLInputElement).value).toBe(repo.url);
  expect(submit).toHaveBeenLastCalledWith({ action: "repository", url: repo.url, summary: repo.summary, helpWanted: repo.helpWanted, issues: repo.issues, skills: ["typescript", "documentation"], permission: true, tagOwner: false });
  await user.click(screen.getByLabelText(/The bot may tag me/)); await user.click(screen.getByRole("button", { name: "Submit repo for approval" }));
  await waitFor(() => expect((url as HTMLInputElement).value).toBe("")); expect(submit.mock.calls[1][0].tagOwner).toBe(true);
});

it("only offers owner controls and disables editing during requests", async () => {
  const user = userEvent.setup(); const submit = vi.fn().mockResolvedValue(true);
  const view = render(<RepositorySubmissions repositories={[repo]} login="Bob" busy={false} submit={submit} />);
  expect(screen.getByText("Queued for announcement")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Close submission" })).toBeNull();
  view.rerender(<RepositorySubmissions repositories={[repo]} login="Alice" busy={false} submit={submit} />);
  await user.click(screen.getByRole("button", { name: "Pause help requests" })); expect(submit).toHaveBeenCalledWith({ action: "repository-progress", id: repo.id, needsHelp: false });
  view.rerender(<RepositorySubmissions repositories={[repo]} login="Alice" busy={true} submit={submit} />);
  expect((screen.getByRole("button", { name: "Close submission" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByText("Submit an open-source repo")); expect((screen.getByLabelText("GitHub repository link") as HTMLInputElement).matches(":disabled")).toBe(true);
  expect(screen.getByRole("link", { name: "Starter issue #1" }).getAttribute("rel")).toBe("noopener noreferrer");
});
