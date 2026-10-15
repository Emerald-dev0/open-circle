import { ApiError } from "./api";

export function isRateLimited(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}

export function retryApiQuery(failures: number, error: Error): boolean {
  if (error.name === "AbortError") return false;
  if (error instanceof ApiError && error.retryAt && error.retryAt > Date.now()) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) return false;
  return failures < 2;
}

export function pollApi(interval: number) {
  return (query: { state: { error: Error | null } }): number => {
    const error = query.state.error;
    return error instanceof ApiError && error.retryAt
      ? Math.max(interval, error.retryAt - Date.now())
      : interval;
  };
}
