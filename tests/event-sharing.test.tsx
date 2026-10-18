import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Events from "../src/pages/Events";
import { eventsApi } from "../src/lib/events-api";
import { emptyEvent, type EventView } from "../shared/events";

vi.mock("../src/hooks/use-community", () => ({ useCommunity: () => ({ data: { profile: { id: 42 } }, isPending: false, isError: false }) }));
vi.mock("../src/components/account-corner", () => ({ AccountCorner: () => null }));
vi.mock("../src/components/dock", () => ({ Dock: () => null }));

it("shares the permanent event page from the event list without nesting an action inside a link", async () => {
  const event: EventView = { id: "event", slug: "typescript-session", content: { ...emptyEvent(), title: "Learn TypeScript", host: "Alice", startsAt: Date.now() + 3600000, endsAt: Date.now() + 7200000 }, published: true, version: 1, cover: null, recording: null, files: [], createdAt: Date.now(), updatedAt: Date.now() };
  vi.spyOn(eventsApi, "list").mockResolvedValue({ events: [event] });
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<MemoryRouter initialEntries={["/events"]}><QueryClientProvider client={client}><Routes><Route path="/events" element={<Events />} /></Routes></QueryClientProvider></MemoryRouter>);
  const share = await screen.findByRole("button", { name: "Share event: Learn TypeScript" });
  expect(share.closest("a")).toBeNull();
  expect(screen.getByRole("heading", { name: "Learn TypeScript" }).closest("a")?.getAttribute("href")).toBe("/events/typescript-session");
  const register = screen.getByRole("link", { name: "Register for Learn TypeScript" });
  expect(register.getAttribute("href")).toBe("/events/typescript-session#register");
  expect(register.closest("a")?.querySelector("a")).toBeNull();
  await user.click(share);
  await waitFor(() => expect(copy).toHaveBeenCalledWith(`${window.location.origin}/events/typescript-session`));
});
