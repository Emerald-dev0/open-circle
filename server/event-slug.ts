import { randomInt } from "node:crypto";
import { HttpError } from "./http.js";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
export function newEventSlug() { return Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(""); }
export function eventLookupId(value: string) { return /(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(value)?.[1].toLowerCase() ?? null; }
export function eventSlugCollision(error: unknown) {
  if (error instanceof HttpError) return error.code === "event_slug_conflict";
  if (!error || typeof error !== "object") return false;
  const failure = error as { code?: string; constraint?: string };
  return failure.code === "23505" && failure.constraint === "opencircle_events_slug_key";
}
