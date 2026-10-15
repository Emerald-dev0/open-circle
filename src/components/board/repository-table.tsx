import { BranchingPathsUpIcon, StarIcon } from "@solar-icons/react/bold-duotone";
import { FiArrowUp, FiBookmark, FiGitBranch } from "react-icons/fi";
import { motion, useReducedMotion } from "motion/react";
import type { PublicRepository } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRID =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 md:grid-cols-[2rem_minmax(0,1fr)_5rem_4rem_6rem] md:gap-3";

export function RepositoryTable({
  repositories,
  limit = 50,
  onShowAll,
  label = "Repositories ranked by stars",
  counts = {},
  voted = new Set<string>(),
  saved = new Set<string>(),
  votingDisabled = false,
  onVote,
  onSave,
}: {
  repositories: PublicRepository[];
  limit?: number;
  onShowAll?: () => void;
  label?: string;
  counts?: Record<string, number>;
  voted?: ReadonlySet<string>;
  saved?: ReadonlySet<string>;
  votingDisabled?: boolean;
  onVote?: (repository: PublicRepository, active: boolean) => void;
  onSave?: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div>
      <div
        role="table"
        aria-label={label}
        aria-rowcount={repositories.length + 1}
      >
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              GRID,
              "px-3 pb-3 text-[11px] font-medium text-t3 md:px-5",
            )}
          >
            <span role="columnheader">#</span>
            <span role="columnheader">Repository</span>
            <span role="columnheader" className="text-right">
              Stars
            </span>
            <span role="columnheader" className="hidden text-right md:block">
              Forks
            </span>
            <span role="columnheader" className="hidden md:block">
              Language
            </span>
          </div>
        </div>
        <div role="rowgroup" className="flex flex-col gap-1">
          {repositories.slice(0, limit).map((repo, index) => (
            <motion.div
              key={repo.id}
              role="row"
              layout={reducedMotion ? false : "position"}
              transition={{
                layout: { type: "spring", stiffness: 420, damping: 38 },
              }}
              className={cn(
                GRID,
                "rounded-[28px] px-3 py-3 md:px-5",
                index % 2 === 1 && "surface-quiet",
              )}
            >
              <span role="cell" className="text-sm tabular text-t3">
                {repo.rank}
              </span>
              <div role="cell" className="min-w-0">
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 items-start gap-2 rounded-lg md:items-center md:gap-3"
                >
                  <Avatar className="size-6 shrink-0 md:size-8">
                    <AvatarImage
                      src={repo.ownerAvatarUrl}
                      alt=""
                      loading="lazy"
                    />
                    <AvatarFallback className="bg-alva-card text-[10px]">
                      {repo.ownerNickname.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <strong
                      className="block break-words text-sm font-medium text-foreground [overflow-wrap:anywhere] md:truncate"
                      title={repo.fullName}
                    >
                      {repo.name}
                    </strong>
                    <span className="block truncate text-xs text-t3">
                      @{repo.ownerLogin}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-t3 md:hidden">
                      {repo.language && <span className="break-words [overflow-wrap:anywhere]">{repo.language}</span>}
                      <span className="inline-flex items-center gap-1 tabular">
                        <FiGitBranch className="size-3 shrink-0" aria-hidden="true" />
                        {formatCount(repo.forks)}<span className="sr-only"> forks</span>
                      </span>
                    </span>
                    {repo.description && (
                      <span
                        className="mt-1 line-clamp-2 break-words text-xs text-t3 [overflow-wrap:anywhere] md:line-clamp-none md:truncate md:text-[11px]"
                        title={repo.description}
                      >
                        {repo.description}
                      </span>
                    )}
                  </span>
                </a>
                {(onVote || onSave) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {onVote && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TextureButton
                            type="button"
                            variant={voted.has(`repo:${repo.id}`) ? "primary" : "minimal"}
                            size="default"
                            aria-label={`${voted.has(`repo:${repo.id}`) ? "Remove upvote from" : "Upvote"} ${repo.fullName}`}
                            aria-pressed={voted.has(`repo:${repo.id}`)}
                            disabled={votingDisabled}
                            onClick={() => onVote(repo, !voted.has(`repo:${repo.id}`))}
                            className="h-11 min-w-11 w-auto tabular"
                            innerClassName="gap-1.5 px-3 text-xs"
                          >
                            <FiArrowUp className="size-4" aria-hidden="true" />
                            <span>{formatCount(counts[`repo:${repo.id}`] ?? 0)}</span>
                          </TextureButton>
                        </TooltipTrigger>
                        <TooltipContent>
                          {voted.has(`repo:${repo.id}`) ? "Remove your community upvote" : "Upvote for the circle. GitHub stars stay separate."}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {onSave && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TextureButton
                            type="button"
                            variant={saved.has(repo.id) ? "primary" : "icon"}
                            size="icon"
                            aria-label={`${saved.has(repo.id) ? "Unsave" : "Save"} ${repo.fullName}`}
                            aria-pressed={saved.has(repo.id)}
                            onClick={() => onSave(repo.id)}
                            className="size-11"
                            innerClassName="p-3"
                          >
                            <FiBookmark className={cn("size-4", saved.has(repo.id) && "fill-current")} aria-hidden="true" />
                          </TextureButton>
                        </TooltipTrigger>
                        <TooltipContent>
                          {saved.has(repo.id) ? "Remove from saved repositories" : "Save on this device"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
              <span
                role="cell"
                className="inline-flex items-center justify-end gap-1.5 text-sm tabular text-foreground"
              >
                <StarIcon size={12} className="text-t3" aria-hidden />
                {formatCount(repo.stars)}
              </span>
              <span
                role="cell"
                className="hidden items-center justify-end gap-1.5 text-sm tabular text-t3 md:inline-flex"
              >
                <BranchingPathsUpIcon size={12} aria-hidden />
                {formatCount(repo.forks)}
              </span>
              <span
                role="cell"
                className="hidden truncate text-xs text-t3 md:block"
              >
                {repo.language ?? "—"}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      {repositories.length > limit && onShowAll && (
        <div className="mt-4 flex justify-center">
          <TextureButton
            variant="minimal"
            size="sm"
            className="w-auto"
            onClick={onShowAll}
          >
            Show all {formatFull(repositories.length)} repositories
          </TextureButton>
        </div>
      )}
    </div>
  );
}
