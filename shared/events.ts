export const EVENT_BODY_BYTES = 96 * 1024;
export const EVENT_PART_BYTES = 16 * 1024 * 1024;
export const EVENT_LIMITS = { cover: 3 * 1024 * 1024, recording: 5 * 1024 * 1024 * 1024, resource: 50 * 1024 * 1024 } as const;
export type AssetKind = keyof typeof EVENT_LIMITS;
export interface EventResource { id: string; title: string; description: string; url: string; assetId: string | null }
export interface EventContent {
  title: string; summary: string; description: string; coverAlt: string; host: string; hostUrl: string;
  startsAt: number | null; endsAt: number | null; timezone: string; platform: string; joinUrl: string; instructions: string;
  cancelled: boolean; botSessionId: string; resources: EventResource[];
}
export interface EventAsset { id: string; key: string; kind: AssetKind; title: string; filename: string; contentType: string; size: number; duration: number | null; uploadedBy: number; uploadedAt: number }
export interface EventRecord { id: string; slug: string; content: EventContent; published: boolean; version: number; cover: EventAsset | null; recording: EventAsset | null; files: EventAsset[]; createdBy: number; createdAt: number; updatedAt: number }
export interface EventUpload { id: string; eventId: string; adminId: number; key: string; multipartId: string; kind: AssetKind; title: string; filename: string; contentType: string; size: number; duration: number | null; state: "uploading" | "complete" | "aborted"; createdAt: number }
export interface EventRegistrationInput { name: string; email: string }
export interface EventRegistration extends EventRegistrationInput { id: string; eventId: string; memberId: number; login: string; registeredAt: number }
export interface EventRegistrationPage { registrations: EventRegistration[]; total: number; page: number; pageSize: number }
export const EVENT_REGISTRATION_PAGE_SIZE = 50;
export function eventRegistrationOpen(event: Pick<EventView, "published" | "content">, now = Date.now()) { return event.published && !event.content.cancelled && event.content.endsAt !== null && event.content.endsAt > now; }
export type EventView = Omit<EventRecord, "createdBy" | "files" | "cover" | "recording"> & { cover: Omit<EventAsset, "key" | "uploadedBy"> | null; recording: Omit<EventAsset, "key" | "uploadedBy"> | null; files: Omit<EventAsset, "key" | "uploadedBy">[] };
export function emptyEvent(): EventContent { return { title: "", summary: "", description: "", coverAlt: "", host: "", hostUrl: "", startsAt: null, endsAt: null, timezone: "Africa/Lagos", platform: "", joinUrl: "", instructions: "", cancelled: false, botSessionId: "", resources: [] }; }
export function eventStatus(event: Pick<EventView, "content" | "recording">, now = Date.now()) {
  if (event.content.cancelled) return "Cancelled";
  if (event.content.startsAt === null || event.content.endsAt === null) return "Schedule pending";
  if (event.content.startsAt !== null && now < event.content.startsAt) return "Upcoming";
  if (event.content.endsAt !== null && now < event.content.endsAt) return "Ongoing";
  return event.recording ? "Recording available" : "Ended";
}
export function eventDate(value: number | null, timezone: string) { return value === null ? "Date to be confirmed" : new Intl.DateTimeFormat("en", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value); }
export function eventLocalTime(value: number | null, timezone: string) {
  if (value === null) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function eventTimestamp(value: string, timezone: string): number | null {
  if (!value) return null;
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) throw new Error("Enter a valid event date and time.");
  let result = target;
  for (let i = 0; i < 4; i++) result += target - Date.parse(`${eventLocalTime(result, timezone)}:00Z`);
  if (eventLocalTime(result, timezone) !== value) throw new Error("That local time does not exist in this timezone. Choose another time.");
  return result;
}
export function eventMediaUrl(slug: string, id: string, admin = false) { return `/api/event-media?${new URLSearchParams({ slug, asset: id, ...(admin ? { admin: "1" } : {}) })}`; }
export function fileSize(size: number) { return size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }
