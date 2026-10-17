import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Events from "../src/pages/Events";
import { eventsApi } from "../src/lib/events-api";
import { emptyEvent, type EventView } from "../shared/events";

vi.mock("../src/hooks/use-community", () => ({
  useCommunity: () => ({ isPending: false, isError: false, data: { profile: { id: 42 } }, refetch: vi.fn() }),
}));
vi.mock("../src/components/account-corner", () => ({ AccountCorner: () => null }));
vi.mock("../src/components/dock", () => ({ Dock: () => null }));

const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/events"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/events" element={<Events />} /><Route path="/community" element={<h1>Community discussions</h1>} /></Routes></MemoryRouter></QueryClientProvider>);
}

function event(past: boolean, cancelled = false): EventView {
  const start = Date.now() + (past ? -7200000 : 3600000);
  return {
    id: "typescript-session", slug: "typescript-session", published: true, version: 1,
    content: { ...emptyEvent(), title: "Learn TypeScript", startsAt: start, endsAt: start + 3600000, cancelled },
    cover: null, recording: null, files: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
}

beforeEach(() => vi.spyOn(eventsApi, "list").mockResolvedValue({ events: [] }));
afterEach(() => clients.splice(0).forEach(client => client.clear()));

it("explains both empty schedules and gives members a working route to discussions", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByRole("status", { name: "No upcoming events" });
  expect(screen.queryByRole("button", { name: "View past events" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Past & recordings" }));
  expect(screen.getByRole("status", { name: "No past events yet" })).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Explore discussions" }));
  expect(screen.getByRole("heading", { name: "Community discussions" })).toBeTruthy();
});

it("opens available past events from the empty upcoming schedule and keeps keyboard focus", async () => {
  const user = userEvent.setup();
  vi.mocked(eventsApi.list).mockResolvedValue({ events: [event(true)] });
  mount();
  const browse = await screen.findByRole("button", { name: "View past events" });
  browse.focus();
  await user.keyboard("{Enter}");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Past & recordings" }));
  expect(screen.getByRole("link", { name: /Learn TypeScript/ }).getAttribute("href")).toBe("/events/typescript-session");
  expect(screen.queryByRole("status", { name: "No upcoming events" })).toBeNull();
});

it("returns to available upcoming events from the empty archive", async () => {
  const user = userEvent.setup();
  vi.mocked(eventsApi.list).mockResolvedValue({ events: [event(false)] });
  mount();
  await screen.findByRole("link", { name: /Learn TypeScript/ });
  await user.click(screen.getByRole("tab", { name: "Past & recordings" }));
  await user.click(screen.getByRole("button", { name: "View upcoming events" }));
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Upcoming" }));
  expect(screen.getByRole("link", { name: /Learn TypeScript/ })).toBeTruthy();
});

it("keeps cancelled future events in the archive", async () => {
  const user = userEvent.setup();
  vi.mocked(eventsApi.list).mockResolvedValue({ events: [event(false, true)] });
  mount();
  await user.click(await screen.findByRole("button", { name: "View past events" }));
  expect(screen.getByText("Cancelled")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Learn TypeScript/ })).toBeTruthy();
});

it("shows a failed request as an error and recovers to the empty schedule on retry", async () => {
  const user = userEvent.setup();
  vi.mocked(eventsApi.list).mockRejectedValueOnce(new Error("Events are unavailable. Try again."));
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByRole("status", { name: "No upcoming events" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("status", { name: "No upcoming events" });
});
