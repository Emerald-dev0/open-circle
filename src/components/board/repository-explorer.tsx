import { ApiError } from "@/lib/api";
import { useRepositoryStars } from "@/hooks/use-repository-stars";
import { RepositoryStarButton } from "./repository-star-button";
import { isRateLimited } from "@/lib/query-policy";
import { useEffect, useMemo, useState } from "react";
import { useErrorToast } from "@/hooks/use-error-toast";
import { MagnifierIcon, Tuning2Icon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import type { PublicRepository } from "@shared/types";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCommunity, useCommunityVote } from "@/hooks/use-community";
import { formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RepositoryTable } from "./repository-table";
import { Pagination } from "@/components/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { CommunityVotesSkeleton } from "@/components/site-skeleton";

const SAVED_KEY = "opencircle:saved-repositories:v1";
const EMPTY_COUNTS: Record<string, number> = {};
const SORT_LABELS = {
  stars: "stars",
  votes: "community upvotes",
  updated: "recent updates",
};

type Sort = keyof typeof SORT_LABELS;

function readSaved(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function RepositoryExplorer({ repositories }: { repositories: PublicRepository[] }) {
  const community = useCommunity();
  const vote = useCommunityVote();
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const [sort, setSort] = useState<Sort>("stars");
  const [saved, setSaved] = useState(readSaved);
  const counts = community.data?.counts ?? EMPTY_COUNTS;
  const voted = useMemo(() => new Set(community.data?.voted ?? []), [community.data?.voted]);
  const languages = useMemo(
    () => [...new Set(repositories.flatMap((repo) => repo.language ? [repo.language] : []))].sort(),
    [repositories],
  );

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === SAVED_KEY || event.key === null) setSaved(readSaved());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return repositories.filter((repo) =>
      (!language || repo.language === language) &&
      (!query || [repo.name, repo.fullName, repo.ownerLogin, repo.ownerNickname, repo.description ?? ""].some((value) => value.toLowerCase().includes(query))),
    ).sort((a, b) => {
      if (sort === "votes") {
        const difference = (counts[`repo:${b.id}`] ?? 0) - (counts[`repo:${a.id}`] ?? 0);
        if (difference) return difference;
      }
      if (sort === "updated") {
        const difference = (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
        if (difference) return difference;
      }
      return b.stars - a.stars || b.forks - a.forks || a.fullName.localeCompare(b.fullName);
    }).map((repo, index) => ({ ...repo, rank: index + 1 }));
  }, [repositories, language, search, sort, counts]);

  const pagination = usePagination(visible, 20, JSON.stringify([search, language, sort]));

  const stars = useRepositoryStars(pagination.items.map((repo) => repo.id), community.data?.profile?.id, community.data?.profile?.starsConnected);
  const starError = stars.status.error;
  const reconnect = starError instanceof ApiError && starError.code === "github_stars_permission";
  const mutationReconnect = stars.mutation.error instanceof ApiError && ["github_stars_permission", "github_required"].includes(stars.mutation.error.code);
  const starStatuses = new Map(stars.status.data?.repositories.map((repo) => [repo.id, repo]));

  function toggleSaved(id: string) {
    const next = new Set(saved);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
    } catch {
      toast.message("Saved for this visit. Browser storage is unavailable.");
    }
  }

  function resetFilters() {
    setSearch("");
    setLanguage("");
  }

  const hasFilters = Boolean(search || language);
  const filtersActive = Boolean(language) || sort !== "stars";
  const [filtersOpen, setFiltersOpen] = useState(false);

  useErrorToast(community.error ? true : null, "Community upvotes could not load.", { id: "upvotes-load", retry: () => community.refetch() });
  useErrorToast(starError, "GitHub stars could not load.", { id: "github-stars-load", retry: () => stars.status.refetch() });
  useErrorToast(stars.mutation.error, "Your GitHub star could not update. Try again.");
  useErrorToast(vote.error, "Your upvote could not be saved. Try again.");

  return (
    <TooltipProvider delayDuration={200}>
      <div ref={pagination.regionRef} tabIndex={-1} className="scroll-mt-6 space-y-5">
        <div className="space-y-3">
          {/* Phones: search plus a filter toggle on one line; the selects open
              underneath. From sm up all three sit inline. Same as Tools. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_11rem] sm:gap-3">
            <div className="relative min-w-0">
              <MagnifierIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-t3" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search spotlight repos"
                placeholder="Search spotlight repos or builders"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="field pl-11 text-base sm:text-[15px]"
              />
            </div>
            <TextureButton
              type="button"
              variant="icon"
              size="icon"
              className="relative size-11 sm:hidden"
              aria-label="Filters"
              aria-expanded={filtersOpen}
              aria-controls="repository-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Tuning2Icon className="size-5" aria-hidden="true" />
              {filtersActive && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-foreground" aria-hidden="true" />}
            </TextureButton>
            <div
              id="repository-filters"
              className={cn(
                "col-span-2 grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out sm:contents",
                filtersOpen ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0 sm:visible sm:opacity-100",
              )}
            >
              <div className="grid min-h-0 grid-cols-2 gap-2 overflow-hidden sm:contents">
                <SharedSelect
                  aria-label="Filter by language"
                  value={language || "all"}
                  onValueChange={(value) => setLanguage(value === "all" ? "" : value)}
                  options={[{ value: "all", label: "All languages" }, ...languages.map((item) => ({ value: item, label: item }))]}
                  className="min-w-0 text-sm"
                />
                <SharedSelect
                  aria-label="Sort spotlight repos"
                  value={sort}
                  onValueChange={(value) => setSort(value as Sort)}
                  options={[{ value: "stars", label: "Most stars" }, { value: "votes", label: "Community upvotes" }, { value: "updated", label: "Recently updated" }]}
                  className="min-w-0 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 text-xs text-t3">
            <p role="status">{formatFull(visible.length)} of {formatFull(repositories.length)} spotlight {repositories.length === 1 ? "repo" : "repos"}</p>
            {hasFilters && <TextureButton type="button" variant="minimal" size="default" onClick={resetFilters} className="h-11 w-auto" innerClassName="px-3 text-xs">Reset filters</TextureButton>}
          </div>
        </div>

        {community.isPending && <CommunityVotesSkeleton />}

        {visible.length > 0 ? (
          <>
          <RepositoryTable
            key={JSON.stringify([search, language, sort, pagination.page])}
            repositories={pagination.items}
            label={`Spotlight repos ranked by ${SORT_LABELS[sort]}`}
            counts={counts}
            voted={voted}
            saved={saved}
            votingDisabled={!community.data || vote.isPending || (Boolean(community.error) && !isRateLimited(community.error))}
            pendingTarget={vote.isPending ? vote.variables?.target ?? null : null}
            onVote={(repo, active) => vote.mutate({ target: `repo:${repo.id}`, active })}
            onSave={toggleSaved}
            renderStar={(repo) => <RepositoryStarButton
              repo={repo}
              status={starStatuses.get(repo.id)}
              connected={Boolean(stars.status.data?.connected) && !reconnect && !mutationReconnect}
              available={community.data?.signInAvailable === true}
              disabled={stars.busy || (community.data?.profile?.starsConnected === true && stars.status.isPending) || (Boolean(starError) && !reconnect)}
              pending={stars.mutation.isPending && stars.mutation.variables?.repositoryId === repo.id}
              onStar={(active) => stars.mutation.mutate({ repositoryId: repo.id, active })}
            />}
          />
          <Pagination {...pagination} label="Spotlight" onPageChange={pagination.changePage} />
          </>
        ) : (
          <div className="surface-quiet rounded-[28px] px-5 py-8 text-center">
            <p className="text-sm text-foreground">{repositories.length === 0 ? "No spotlight repos yet." : "No spotlight repos match your filters."}</p>
            <p className="mt-2 text-xs text-t3">{repositories.length === 0 ? "One project per developer, with at least 5 stars." : "Try another search or reset your filters."}</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
