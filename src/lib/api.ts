import type {
  AdminAction,
  AdminState,
  ApiErrorBody,
  Board,
  Preview,
  RegisterInput,
  RegisterResult,
} from "@shared/types";

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
  board: () => request<Board>("/api/board"),
  preview: (login: string) => request<Preview>(`/api/preview?u=${encodeURIComponent(login.toLowerCase())}`),
  register: (input: RegisterInput) =>
    request<RegisterResult>("/api/register", { method: "POST", body: JSON.stringify(input) }),
  adminState: (secret: string) =>
    request<AdminState>("/api/admin", { headers: { authorization: `Bearer ${secret}` } }),
  adminAction: (secret: string, action: AdminAction) =>
    request<AdminState>("/api/admin", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(action),
    }),
};
