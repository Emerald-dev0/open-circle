import { randomUUID } from "node:crypto";
import { getStore } from "../server/db.js";
import { getEventStore } from "../server/event-store.js";
import { eventApiHandler, eventReader, readEvent, EVENT_HEADERS } from "../server/events.js";
import { HttpError, json, readJson } from "../server/http.js";

export function GET(req: Request) { return eventApiHandler(req, async () => {
  const profile = await eventReader(req); const params = new URL(req.url).searchParams; const admin = params.get("admin") === "1";
  const event = await readEvent(params.get("slug") ?? "", admin); const store = getEventStore();
  if (!admin) return json({ registration: await store.registration(event.id, profile.id) }, 200, EVENT_HEADERS);
  const page = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new HttpError(400, "registration_page", "Choose a valid registration page.");
  return json(await store.registrations(event.id, Number(page)), 200, EVENT_HEADERS);
}); }
export function POST(req: Request) { return eventApiHandler(req, async () => {
  if (new URL(req.url).searchParams.has("admin")) throw new HttpError(400, "registration_member", "Register using your member account.");
  const profile = await eventReader(req);
  if (!await getStore().rateLimit(`events:register:member:${profile.id}`, 12, 60)) throw new HttpError(429, "rate_limited", "Too many registration attempts. Wait a minute and try again.", undefined, { "retry-after": "60" });
  const input = await readJson(req);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "registration_input", "Enter your name and email.");
  const data = input as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : ""; const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!name || name.length > 150 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new HttpError(400, "registration_name", "Enter your full name (up to 150 characters).", "name");
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new HttpError(400, "registration_email", "Enter a valid email address.", "email");
  if (typeof data.slug !== "string" || data.slug.length > 250) throw new HttpError(400, "registration_event", "Choose a valid event.");
  const event = await readEvent(data.slug, false);
  const registration = await getEventStore().register({ id: randomUUID(), eventId: event.id, memberId: profile.id, login: profile.login, name, email, registeredAt: Date.now() });
  return json({ registration }, 200, EVENT_HEADERS);
}); }
