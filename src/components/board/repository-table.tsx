import type { ReactNode } from "react";
import { StarIcon } from "@solar-icons/react/bold-duotone";
import { BookmarkIcon, GitPullRequestIcon, SquareTopDownIcon } from "@solar-icons/react/linear";
import { BookmarkIcon as SavedBookmarkIcon } from "@solar-icons/react/bold";
import { AnimatePresence, motion } from "motion/react";
import type { PublicRepository } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VoteButton } from "@/components/board/vote-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Repositories as cards, not a table: identity and details on the left, the
 * community upvote on the right of the same line. Reads the same on a phone.
 */
export function RepositoryTable({
  repositories,
  label = "Spotlight repos ranked by stars",
  counts = {},
  voted = new Set<string>(),
  saved = new Set<string>(),
  votingDisabled = false,
  pendingTarget = null,
  onVote,
  onSave,
  renderStar,
}: {
  repositories: PublicRepository[];
  label?: string;
  counts?: Record<string, number>;
  voted?: ReadonlySet<string>;
  saved?: ReadonlySet<string>;
  votingDisabled?: boolean;
  /** `repo:ID` whose vote is being saved. */
  pendingTarget?: string | null;
  onVote?: (repository: PublicRepository, active: boolean) => void;
  onSave?: (id: string) => void;
  renderStar?: (repo: PublicRepository) => ReactNode;
}) {
  return (
    <div>
      <ul aria-label={label} className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {repositories.map((repo) => {
            const target = `repo:${repo.id}`;
            const isVoted = voted.has(target);
            const isSaved = saved.has(repo.id);
            return (
              <motion.li
                key={repo.id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ layout: { type: "spring", stiffness: 340, damping: 34 }, opacity: { duration: 0.2 } }}
                className="surface-quiet grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[24px] px-4 py-3 sm:gap-x-4 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={repo.fullName}
                      className="touch-target group inline-flex min-h-8 max-w-full items-center gap-2 rounded text-sm font-medium text-foreground"
                    >
                      <Avatar className="size-6 shrink-0" aria-hidden="true">
                        <AvatarImage src={repo.ownerAvatarUrl} alt="" loading="lazy" />
                        <AvatarFallback className="bg-alva-card text-[10px]">{repo.ownerNickname.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{repo.name}</span>
                      <SquareTopDownIcon className="size-3 shrink-0 text-t3 group-hover:text-foreground" aria-hidden="true" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    {repo.language && <span className="break-words text-[11px] text-t3 [overflow-wrap:anywhere]">{repo.language}</span>}
                  </div>

                  {repo.description && (
                    <p className="mt-1 max-w-[65ch] break-words text-xs leading-relaxed text-t2 [overflow-wrap:anywhere]">
                      {repo.description}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-t3">
                    <span className="tabular" aria-label={`Rank ${repo.rank}`}>#{repo.rank}</span>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]" title={repo.ownerNickname}>@{repo.ownerLogin}</span>
                    {renderStar ? renderStar(repo) : <span className="inline-flex items-center gap-1 tabular" title={`${formatFull(repo.stars)} GitHub stars`} aria-label={`${formatFull(repo.stars)} GitHub stars`}>
                      <StarIcon size={12} aria-hidden />
                      {formatCount(repo.stars)}<span className="sr-only"> stars</span>
                    </span>}
                    <span className="inline-flex items-center gap-1 tabular" title={`${formatFull(repo.forks)} forks`} aria-label={`${formatFull(repo.forks)} forks`}>
                      <GitPullRequestIcon size={12} aria-hidden />
                      {formatCount(repo.forks)}<span className="sr-only"> forks</span>
                    </span>
                    {onSave && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${isSaved ? "Unsave" : "Save"} ${repo.fullName}`}
                            aria-pressed={isSaved}
                            onClick={() => onSave(repo.id)}
                            className="touch-target inline-flex min-h-8 items-center gap-1.5 rounded hover:text-foreground"
                          >
                            {isSaved ? <SavedBookmarkIcon className="size-3.5 text-foreground" aria-hidden="true" /> : <BookmarkIcon className="size-3.5" aria-hidden="true" />}
                            <span aria-hidden="true">{isSaved ? "Saved" : "Save"}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{isSaved ? "Remove from saved repositories" : "Save on this device"}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {onVote && (
                  // Same pill as tool votes, upvote only: button and count share one soft background.
                  <div role="group" aria-label={`Vote on ${repo.fullName}`} className="flex flex-col items-center gap-0.5 rounded-full bg-foreground/[0.035] p-0.5 sm:flex-row">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <VoteButton
                          type="button"
                          selected={isVoted}
                          aria-label={`${isVoted ? "Remove upvote from" : "Upvote"} ${repo.fullName}`}
                          disabled={votingDisabled}
                          loading={pendingTarget === target}
                          onClick={() => onVote(repo, !isVoted)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {isVoted ? "Remove your community upvote" : "Upvote for the circle."}
                      </TooltipContent>
                    </Tooltip>
                    <span
                      className={cn("min-w-8 pb-1.5 pt-0.5 text-center text-xs font-medium tabular text-t2 sm:px-1 sm:py-0 sm:pr-2.5", isVoted && "text-up")}
                      title={`${formatFull(counts[target] ?? 0)} upvotes`}
                      aria-label={`${formatFull(counts[target] ?? 0)} upvotes for ${repo.fullName}`}
                    >
                      {formatCount(counts[target] ?? 0)}
                    </span>
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
