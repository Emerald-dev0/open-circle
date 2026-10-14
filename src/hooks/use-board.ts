import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Board } from "@shared/types";
import { api } from "@/lib/api";

export const BOARD_KEY = ["board"] as const;
const POLL_MS = 10_000;

/** Keeps whichever snapshot is newer. */
export function newerBoard(current: Board | undefined, next: Board): Board {
  return current && current.updatedAt > next.updatedAt ? current : next;
}

/**
 * The live board. Polls while the tab is visible; the CDN may answer with a
 * snapshot a few seconds old, so an older one never replaces a newer one
 * (e.g. right after you register and the response already includes you).
 */
export function useBoard() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: async () => newerBoard(queryClient.getQueryData<Board>(BOARD_KEY), await api.board()),
    refetchInterval: POLL_MS,
    staleTime: POLL_MS / 2,
    retry: 2,
  });
}

export function useSetBoard() {
  const queryClient = useQueryClient();
  return (board: Board) =>
    queryClient.setQueryData<Board>(BOARD_KEY, (current) => newerBoard(current, board));
}
