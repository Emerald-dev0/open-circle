import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RepositoryStars } from "@shared/repository-stars";
import { api } from "@/lib/api";
import { retryApiQuery } from "@/lib/query-policy";
import { GITHUB_SIGN_OUT_KEY } from "./use-community";

export const REPOSITORY_STARS_KEY = ["repository-stars"] as const;
export const REPOSITORY_STAR_KEY = ["repository-star"] as const;

export function useRepositoryStars(ids: string[], userId?: number, connected = false) {
  const client = useQueryClient();
  const prefix = [...REPOSITORY_STARS_KEY, userId];
  const status = useQuery({
    queryKey: [...prefix, [...ids].sort()],
    queryFn: ({ signal }) => api.repositoryStars(ids, signal),
    enabled: Boolean(userId) && connected && ids.length > 0,
    staleTime: 30_000,
    retry: retryApiQuery,
  });
  const mutation = useMutation({
    mutationKey: REPOSITORY_STAR_KEY,
    mutationFn: api.repositoryStar,
    onMutate: () => client.cancelQueries({ queryKey: prefix }),
    onSuccess: (result) => {
      client.setQueriesData<RepositoryStars>({ queryKey: prefix }, (current) => current ? {
        connected: true,
        repositories: [...current.repositories.filter((repo) => repo.id !== result.id), result],
      } : current);
    },
  });
  const busy = useIsMutating({ mutationKey: REPOSITORY_STAR_KEY }) > 0;
  const signingOut = useIsMutating({ mutationKey: GITHUB_SIGN_OUT_KEY }) > 0;
  return { status, mutation, busy: busy || signingOut };
}
