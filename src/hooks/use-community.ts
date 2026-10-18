import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommunityState } from "@shared/community";
import { pollApi, retryApiQuery } from "@/lib/query-policy";
import { api } from "@/lib/api";
import { BOARD_KEY } from "./use-board";

export const COMMUNITY_KEY = ["community"] as const;
export const TOOL_VOTE_KEY = ["tool-vote"] as const;
export const GITHUB_SIGN_OUT_KEY = ["github-sign-out"] as const;

export function useCommunity() {
  return useQuery({
    queryKey: COMMUNITY_KEY,
    queryFn: ({ signal }) => api.community(signal),
    staleTime: 5_000,
    refetchInterval: pollApi(10_000),
    retry: retryApiQuery,
  });
}

export function useCommunityVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.vote,
    onMutate: () => queryClient.cancelQueries({ queryKey: COMMUNITY_KEY }),
    onSuccess: (result) => {
      queryClient.setQueryData<CommunityState>(COMMUNITY_KEY, (current) => current ? {
        ...current,
        counts: { ...current.counts, [result.target]: result.count },
        voted: result.active
          ? [...current.voted.filter((target) => target !== result.target), result.target]
          : current.voted.filter((target) => target !== result.target),
      } : current);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
        queryClient.invalidateQueries({ queryKey: BOARD_KEY }),
      ]);
    },
  });
}

export function useToolVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TOOL_VOTE_KEY,
    mutationFn: api.toolVote,
    onMutate: () => queryClient.cancelQueries({ queryKey: COMMUNITY_KEY }),
    onSuccess: (result) => {
      queryClient.setQueryData<CommunityState>(COMMUNITY_KEY, (current) => current ? {
        ...current,
        counts: { ...current.counts, [result.target]: result.count },
        toolVotes: { ...current.toolVotes, [result.target]: result.value },
      } : current);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
  });
}

export function useGitHubSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: GITHUB_SIGN_OUT_KEY,
    mutationFn: api.signOut,
    onMutate: () => Promise.all([queryClient.cancelQueries({ queryKey: COMMUNITY_KEY }), queryClient.cancelQueries({ queryKey: ["repository-stars"] }), queryClient.cancelQueries({ queryKey: ["events"] }), queryClient.cancelQueries({ queryKey: ["forum"] }), queryClient.cancelQueries({ queryKey: ["participation"] })]),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["repository-stars"] });
      queryClient.removeQueries({ queryKey: ["events"] });
      queryClient.removeQueries({ queryKey: ["forum"] });
      queryClient.removeQueries({ queryKey: ["participation"] });
      queryClient.setQueryData<CommunityState>(COMMUNITY_KEY, (current) => current ? { ...current, profile: null, toolVotes: {} } : current);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
  });
}
