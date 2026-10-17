import { request } from "./api";
import type { EventContent, EventView, AssetKind } from "@shared/events";
export const eventsApi = {
  list: (admin = false, signal?: AbortSignal) => request<{ events: EventView[]; storageConfigured?: boolean }>(`/api/events${admin ? "?admin=1" : ""}`, { signal, cache: "no-store" }),
  detail: (slug: string, admin = false, signal?: AbortSignal) => request<EventView>(`/api/events?${new URLSearchParams({ slug, ...(admin ? { admin: "1" } : {}) })}`, { signal, cache: "no-store" }),
  save: (id: string, version: number, content: EventContent, action: string) => request<EventView>("/api/events", { method: "POST", headers: { "x-opencircle-admin": "1" }, body: JSON.stringify({ id, version, content, action }) }),
  upload: <T,>(body: Record<string, unknown>, signal?: AbortSignal) => request<T>("/api/event-uploads", { method: "POST", headers: { "x-opencircle-admin": "1" }, body: JSON.stringify(body), signal }),
};
export function fileContentType(file: File, kind: AssetKind) {
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (kind === "resource") return ({ pdf: "application/pdf", txt: "text/plain", md: "text/markdown", zip: "application/zip", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" } as Record<string,string>)[ext ?? ""] ?? file.type;
  return file.type;
}
export function uploadPart(url: string, blob: Blob, progress: (bytes: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("PUT", url); xhr.timeout = 180000; xhr.upload.onprogress = e => progress(e.loaded);
    xhr.onload = () => { cleanup(); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error("Storage rejected this part. Check CORS and retry.")); };
    xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(new Error("The upload connection failed. Retry to continue from this part.")); };
    xhr.onabort = () => { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); return; }
    xhr.send(blob);
  });
}
