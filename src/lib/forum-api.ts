import type { ForumCommand, ForumDetail, ForumPage } from "@shared/forum";
import { request } from "./api";

export const forumApi = {
  list: (params: URLSearchParams, admin: boolean, signal?: AbortSignal) => request<ForumPage>(`/api/${admin ? "forum-admin" : "forum"}?${params}`, { signal, cache: "no-store" }),
  detail: (id: string, page: number, admin: boolean, signal?: AbortSignal) => request<ForumDetail>(`/api/${admin ? "forum-admin" : "forum"}?${new URLSearchParams({ id, page: String(page) })}`, { signal, cache: "no-store" }),
  command: (input: ForumCommand, admin: boolean) => request<ForumDetail>(`/api/${admin ? "forum-admin" : "forum"}`, { method: "POST", headers: admin ? { "x-opencircle-admin": "1" } : {}, body: JSON.stringify(input) }),
};
