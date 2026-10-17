import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useGitHubSignOut } from "../src/hooks/use-community";
import { api } from "../src/lib/api";

it("removes member forum and participation caches on GitHub sign-out without retaining private drafts", async () => {
  const client = new QueryClient();
  client.setQueryData(["community"], { profile: { id: 2, login: "Alice" } });
  client.setQueryData(["forum", 2, "detail", "private"], { body: "A pending private question" });
  client.setQueryData(["participation", 2], { challenge: "private" });
  vi.spyOn(api, "signOut").mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof api.signOut>>);
  function Control() { const signOut = useGitHubSignOut(); return <button onClick={() => signOut.mutate()}>Sign out</button>; }
  render(<QueryClientProvider client={client}><Control /></QueryClientProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(client.getQueryData(["forum", 2, "detail", "private"])).toBeUndefined());
  expect(client.getQueryData(["participation", 2])).toBeUndefined();
  expect(client.getQueryData(["community"])).toMatchObject({ profile: null });
});
