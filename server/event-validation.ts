import { emptyEvent, EVENT_LIMITS, type AssetKind, type EventContent } from "../shared/events.js";
import { HttpError } from "./http.js";
export function eventInvalid(message: string): never { throw new HttpError(400, "event_invalid", message); }
export function eventUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return eventInvalid("Use an HTTPS link under 2,000 characters.");
  if (!value.trim()) return "";
  try { const u = new URL(value.trim()); if (u.protocol !== "https:" || u.username || u.password) throw Error(); return u.href; } catch { return eventInvalid("Use an HTTPS link without a username or password."); }
}
export function parseEvent(value: unknown, publish: boolean): EventContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return eventInvalid("Enter the event details.");
  const raw = value as Record<string, unknown>; const out = emptyEvent();
  const limits = { title: 150, summary: 400, description: 20000, coverAlt: 300, host: 150, platform: 100, instructions: 4000, botSessionId: 200 } as const;
  for (const [key, max] of Object.entries(limits) as [keyof typeof limits, number][]) { if (typeof raw[key] !== "string" || raw[key].length > max) return eventInvalid(`${key} must be under ${max} characters.`); out[key] = raw[key].trim(); }
  if (typeof raw.timezone !== "string" || raw.timezone.length > 100) return eventInvalid("Choose a valid timezone.");
  try { new Intl.DateTimeFormat("en", { timeZone: raw.timezone }); } catch { return eventInvalid("Choose a valid timezone."); }
  out.timezone = raw.timezone; out.hostUrl = eventUrl(raw.hostUrl); out.joinUrl = eventUrl(raw.joinUrl);
  for (const key of ["startsAt", "endsAt"] as const) { const n = raw[key]; if (n !== null && (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 8.64e15)) return eventInvalid("Enter a valid date and time."); out[key] = n as number | null; }
  if (out.startsAt !== null && out.endsAt !== null && out.endsAt <= out.startsAt) return eventInvalid("End time must be after start time, including events crossing midnight.");
  if (typeof raw.cancelled !== "boolean") return eventInvalid("Choose a valid cancellation state."); out.cancelled = raw.cancelled;
  if (!Array.isArray(raw.resources) || raw.resources.length > 40) return eventInvalid("Add up to 40 resources.");
  const ids = new Set<string>();
  out.resources = raw.resources.map((r: Record<string, unknown>) => {
    if (!r || typeof r.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(r.id) || ids.has(r.id) || typeof r.title !== "string" || !r.title.trim() || r.title.length > 150 || typeof r.description !== "string" || r.description.length > 500 || (r.assetId !== null && typeof r.assetId !== "string")) return eventInvalid("Give each resource a unique ID, title and a short description.");
    ids.add(r.id); const url = eventUrl(r.url); if (!r.assetId && !url) return eventInvalid("Add a link or uploaded file to every resource.");
    return { id: r.id, title: r.title.trim(), description: r.description.trim(), url: r.assetId ? "" : url, assetId: r.assetId as string | null };
  });
  if (publish && (!out.title || !out.summary || !out.description || !out.host || !out.platform || out.startsAt === null || out.endsAt === null)) return eventInvalid("Publishing needs a title, summary, description, host, platform, start and end time.");
  return out;
}
export const UPLOAD_TYPES: Record<AssetKind, Record<string, string[]>> = {
  cover: { "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/webp": ["webp"] },
  recording: { "video/mp4": ["mp4"], "video/webm": ["webm"] },
  resource: { "application/pdf": ["pdf"], "text/plain": ["txt"], "text/markdown": ["md"], "application/zip": ["zip"], "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"] },
};
export function validateUpload(input: Record<string, unknown>) {
  const kind = input.kind as AssetKind;
  if (!Object.hasOwn(EVENT_LIMITS, kind) || typeof input.contentType !== "string" || !Object.hasOwn(UPLOAD_TYPES[kind], input.contentType) || typeof input.filename !== "string" || input.filename.length > 200 || !UPLOAD_TYPES[kind][input.contentType].includes(input.filename.split(".").at(-1)?.toLowerCase() ?? "")) return eventInvalid("Choose a supported file type and extension.");
  if (!Number.isSafeInteger(input.size) || Number(input.size) <= 0 || Number(input.size) > EVENT_LIMITS[kind]) return eventInvalid("That file exceeds the upload size limit.");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 150) return eventInvalid("Give the upload a title under 150 characters.");
  if (input.duration != null && (typeof input.duration !== "number" || !Number.isFinite(input.duration) || input.duration < 0 || input.duration > 604800)) return eventInvalid("Recording duration is invalid.");
  return { kind, contentType: input.contentType, filename: input.filename, size: Number(input.size), title: input.title.trim(), duration: typeof input.duration === "number" ? input.duration : null };
}
