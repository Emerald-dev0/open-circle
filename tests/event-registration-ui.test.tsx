import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { eventsApi } from "../src/lib/events-api";
import { ApiError } from "../src/lib/api";
import { emptyEvent, type EventView, type EventRegistration } from "../shared/events";
import { EventRegistration as RegistrationForm } from "../src/components/events/event-registration";
import { EventAttendees } from "../src/components/events/event-attendees";
import { EventCover } from "../src/components/events/event-cover";
import Events from "../src/pages/Events";

const member = vi.hoisted(() => ({ profile: { id: 42, login: "Alice" } as { id: number; login: string } | null }));
vi.mock("../src/hooks/use-community", () => ({ useCommunity: () => ({ data: { profile: member.profile }, isPending: false, isError: false }) }));
vi.mock("../src/components/account-corner", () => ({ AccountCorner: () => null }));
vi.mock("../src/components/dock", () => ({ Dock: () => null }));
const event = (): EventView => ({ id: "event", slug: "website-session", content: { ...emptyEvent(), title: "Build a website", coverAlt: "The complete session poster", startsAt: Date.now()+3600000, endsAt: Date.now()+7200000 }, published: true, version: 1, cover: { id: "cover", kind: "cover", title: "Poster", filename: "poster.png", contentType: "image/png", size: 1000, duration: null, uploadedAt: Date.now() }, recording: null, files: [], createdAt: Date.now(), updatedAt: Date.now() });
let saved: EventRegistration | null;
function wrap(children: React.ReactNode, route = "/events/website-session") { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{children}</MemoryRouter></QueryClientProvider>) }; }
beforeEach(() => {
  member.profile = { id: 42, login: "Alice" };
  saved = null;
  vi.spyOn(eventsApi, "registration").mockImplementation(async () => ({ registration: saved }));
  vi.spyOn(eventsApi, "register").mockImplementation(async (_slug, input) => { saved = { ...input, id: "registration", eventId: "event", memberId: 42, login: "Alice", registeredAt: Date.now() }; return { registration: saved }; });
});
it("shows registration before the cover, retains failed form input and restores confirmation after a refresh", async () => {
  const e = event(); const user = userEvent.setup();
  vi.spyOn(eventsApi, "detail").mockResolvedValue(e);
  const page = wrap(<Routes><Route path="/events/:slug" element={<Events />} /></Routes>);
  const register = await screen.findByRole("button", { name: "Register for event" });
  await waitFor(() => expect((register as HTMLButtonElement).disabled).toBe(false));
  expect(register.compareDocumentPosition(screen.getByRole("button", { name: /View full-size cover/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.click(register);
  await user.type(screen.getByLabelText("Full name"), "Alice Builder");
  await user.type(screen.getByLabelText("Email address"), "alice@example.com");
  vi.mocked(eventsApi.register).mockRejectedValueOnce(new ApiError(503, "unavailable", "Registration could not be saved. Try again."));
  await user.click(screen.getByRole("button", { name: "Confirm registration" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Alice Builder");
  expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("alice@example.com");
  await user.click(screen.getByRole("button", { name: "Confirm registration" }));
  await screen.findByText("You're registered");
  expect(eventsApi.register).toHaveBeenLastCalledWith(e.slug, { name: "Alice Builder", email: "alice@example.com" });
  page.unmount();
  wrap(<RegistrationForm event={e} memberId={42} />);
  await screen.findByText("You're registered");
  expect(screen.queryByRole("button", { name: "Register for event" })).toBeNull();
});
it("opens the form from the list destination, prevents duplicate clicks and does not recreate private data after unmount", async () => {
  const user = userEvent.setup(); const e = event();
  let resolve!: (value: { registration: EventRegistration }) => void;
  vi.mocked(eventsApi.register).mockImplementation(() => new Promise(r => { resolve = r; }));
  const page = wrap(<RegistrationForm event={e} memberId={42} />, "/events/website-session#register");
  await waitFor(() => expect((screen.getByLabelText("Full name") as HTMLInputElement).disabled).toBe(false));
  await user.type(screen.getByLabelText("Full name"), "Alice");
  await user.type(screen.getByLabelText("Email address"), "alice@example.com");
  const confirm = screen.getByRole("button", { name: "Confirm registration" });
  await user.dblClick(confirm);
  expect(eventsApi.register).toHaveBeenCalledTimes(1);
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  page.unmount(); page.client.clear();
  resolve({ registration: { id: "saved", eventId: e.id, memberId: 42, login: "Alice", name: "Alice", email: "alice@example.com", registeredAt: Date.now() } });
  await waitFor(() => expect(page.client.getQueryData(["events",42,"registration",e.id])).toBeUndefined());
});
it("hides the form for cancelled and ended events and never reports a failed status lookup as unregistered", async () => {
  const e = event(); e.content.cancelled = true;
  const page = wrap(<RegistrationForm event={e} memberId={42} />);
  expect(screen.queryByRole("button", { name: "Register for event" })).toBeNull();
  page.unmount();
  const ended = event(); ended.content.endsAt = Date.now()-1;
  const past = wrap(<RegistrationForm event={ended} memberId={42} />);
  expect(screen.queryByRole("button", { name: "Register for event" })).toBeNull();
  expect(screen.getByText("Registration is closed.")).toBeTruthy();
  past.unmount();
  vi.mocked(eventsApi.registration).mockRejectedValue(new ApiError(503,"unavailable","Cannot check your registration."));
  wrap(<RegistrationForm event={event()} memberId={42} />);
  await screen.findByText("Cannot check your registration.");
  expect((screen.getByRole("button", { name: "Register for event" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText("You're registered")).toBeNull();
});
it("offers a prominent sign-in registration link and preserves the event destination for signed-out visitors", async () => {
  member.profile = null;
  const detail = vi.spyOn(eventsApi, "detail");
  wrap(<Routes><Route path="/events/:slug" element={<Events />} /></Routes>);
  const signin = screen.getByRole("link", { name: "Sign in to register" });
  expect(new URL(signin.getAttribute("href")!, "https://opencircle.test").searchParams.get("returnTo")).toBe("/events/website-session");
  expect(detail).not.toHaveBeenCalled();
});
it("replaces legacy event URLs with the short address while retaining preview and registration state", async () => {
  const e = event(); e.slug = "yu48r";
  vi.spyOn(eventsApi, "detail").mockResolvedValue(e);
  function Address() { const location = useLocation(); return <output aria-label="Current address">{location.pathname}{location.search}{location.hash}</output>; }
  wrap(<Routes><Route path="/events/:slug" element={<><Events /><Address /></>} /></Routes>, "/events/old-title-1cc58640-070d-4e8e-b06b-202f3bddf1b5?preview=1#register");
  await waitFor(() => expect(screen.getByLabelText("Current address").textContent).toBe("/events/yu48r?preview=1#register"));
  expect(eventsApi.detail).toHaveBeenCalledWith("yu48r", true, expect.any(AbortSignal));
});
it("opens the complete cover, supports zoom and original media, and restores keyboard focus on Escape", async () => {
  const user = userEvent.setup(); const e = event();
  wrap(<EventCover event={e} admin />);
  const trigger = screen.getByRole("button", { name: "View full-size cover for Build a website" });
  await user.click(trigger);
  const dialog = within(await screen.findByRole("dialog", { name: "Event cover: Build a website" }));
  expect(dialog.getByRole("img").getAttribute("src")).toContain("admin=1");
  await user.click(dialog.getByRole("button", { name: "Zoom in" }));
  expect(dialog.getByRole("img").className).toContain("max-w-none");
  expect(dialog.getByRole("link", { name: "Open original image" }).getAttribute("href")).toBe(dialog.getByRole("img").getAttribute("src"));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
it("shows the saved attendee names and emails in the private admin view", async () => {
  vi.spyOn(eventsApi, "registrations").mockResolvedValue({ registrations: [{ id: "saved", eventId: "event", memberId: 42, login: "Alice", name: "Alice Builder", email: "alice@example.com", registeredAt: Date.now() }], total: 1, page: 1, pageSize: 50 });
  wrap(<EventAttendees slug="website-session" />);
  await screen.findByText("alice@example.com");
  expect(screen.getByRole("heading", { name: "Registrations (1)" })).toBeTruthy();
});
