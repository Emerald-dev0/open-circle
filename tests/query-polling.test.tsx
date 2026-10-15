import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { pollApi, retryApiQuery } from "../src/lib/query-policy";
import { BOARD_KEY, useBoard } from "../src/hooks/use-board";
import { boardFixture, publicMember } from "./helpers/fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps existing results visible, pauses polling for Retry-After and resumes automatically", async () => {
  vi.useFakeTimers();
  const initial = boardFixture({ updatedAt: 1 });
  const next = boardFixture({ updatedAt: 2 });
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "rate_limited", message: "Wait a minute." } }), { status: 429, headers: { "retry-after": "60" } })).mockResolvedValueOnce(new Response(JSON.stringify(next)));
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient();
  const observer = new QueryObserver(client, {
    queryKey: ["polling-regression"],
    queryFn: ({ signal }) => api.board(signal),
    initialData: initial,
    retry: retryApiQuery,
    refetchInterval: pollApi(10_000),
    refetchIntervalInBackground: true,
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toEqual(initial);
    expect(observer.getCurrentResult().error).toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data).toEqual(initial);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(observer.getCurrentResult().data).toEqual(next);
    expect(observer.getCurrentResult().error).toBeNull();
  } finally { unsubscribe(); client.clear(); }
});

it("keeps a newer registration result when an earlier board request finishes late", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const initial = boardFixture({ updatedAt: 1 });
  const joined = boardFixture({ updatedAt: 3, members: [publicMember()] });
  client.setQueryData(BOARD_KEY, initial);
  let finish: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useBoard(), { wrapper });
  let pending: ReturnType<typeof view.result.current.refetch>;
  try {
    act(() => { pending = view.result.current.refetch(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => { client.setQueryData(BOARD_KEY, joined); });
    await act(async () => {
      finish!(new Response(JSON.stringify(boardFixture({ updatedAt: 2 }))));
      await pending;
    });
    expect(client.getQueryData(BOARD_KEY)).toEqual(joined);
  } finally { view.unmount(); client.clear(); }
});
