import type {
  AdminAction,
  AdminState,
  AdminSession,
  ApiErrorBody,
  Board,
  Preview,
  RegisterInput,
  RegisterResult,
} from "@shared/types";
import type { CommunityState, CommunityTool, ToolInput, ToolVoteInput, ToolVoteResult, VoteInput, VoteResult } from "@shared/community";
import type { LinkChallenge, ParticipationAction, ParticipationState } from "@shared/coordination";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "network", "You look offline. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    const error = body?.error;
    throw new ApiError(res.status, error?.code ?? "unknown", error?.message ?? "Something went wrong. Try again.", error?.field);
  }
  return body;
}

export const api = {
  participation: (signal?: AbortSignal) => request<ParticipationState>("/api/participation", { signal }),
  linkWhatsapp: (phone: string) => request<LinkChallenge>("/api/participation", { method: "POST", body: JSON.stringify({ action: "link", phone }) }),
  participate: (input: ParticipationAction) => request<ParticipationState>("/api/participation", { method: "POST", body: JSON.stringify(input) }),
  board: () => request<Board>("/api/board"),
  community: (signal?: AbortSignal) => request<CommunityState>("/api/community", { signal }),
  vote: (input: VoteInput) => request<VoteResult>("/api/vote", { method: "POST", body: JSON.stringify(input) }),
  toolVote: (input: ToolVoteInput) => request<ToolVoteResult>("/api/vote", { method: "POST", body: JSON.stringify(input) }),
  signOut: () => request<{ ok: boolean }>("/api/auth", { method: "POST", body: "{}" }),
  submitTool: (input: ToolInput) => request<CommunityTool>("/api/tools", { method: "POST", body: JSON.stringify(input) }),
  adminSession: (signal?: AbortSignal) => request<AdminSession>("/api/admin-session", { signal, cache: "no-store" }),
  adminSignOut: () => request<{ ok: boolean }>("/api/admin-session", { method: "DELETE", headers: { "x-opencircle-admin": "1" }, body: "{}" }),
  adminTools: (signal?: AbortSignal) => request<CommunityTool[]>("/api/tools", { signal, cache: "no-store" }),
  approveTool: (id: string) => request<{ ok: boolean }>("/api/tools", {
    method: "PATCH",
    headers: { "x-opencircle-admin": "1" },
    body: JSON.stringify({ id, action: "approve" }),
  }),
  removeTool: (id: string) => request<{ ok: boolean }>("/api/tools", {
    method: "DELETE",
    headers: { "x-opencircle-admin": "1" },
    body: JSON.stringify({ id }),
  }),
  preview: (input: RegisterInput) => request<Preview>("/api/preview", { method: "POST", body: JSON.stringify(input) }),
  register: (input: RegisterInput) =>
    request<RegisterResult>("/api/register", { method: "POST", body: JSON.stringify(input) }),
  adminState: (signal?: AbortSignal) =>
    request<AdminState>("/api/admin", { signal, cache: "no-store" }),
  adminAction: (action: AdminAction) =>
    request<AdminState>("/api/admin", {
      method: "POST",
      headers: { "x-opencircle-admin": "1" },
      body: JSON.stringify(action),
    }),
};
