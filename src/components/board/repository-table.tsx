import { BranchingPathsUpIcon, StarIcon } from "@solar-icons/react/bold-duotone";
import { motion, useReducedMotion } from "motion/react";
import type { PublicRepository } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextureButton } from "@/components/ui/texture-button";
import { formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3 sm:grid-cols-[2rem_minmax(0,1fr)_5rem_4rem_6rem]";

export function RepositoryTable({
  repositories,
  limit = 50,
  onShowAll,
}: {
  repositories: PublicRepository[];
  limit?: number;
  onShowAll: () => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div>
      <div
        role="table"
        aria-label="Repositories ranked by stars"
        aria-rowcount={repositories.length + 1}
      >
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              GRID,
              "px-4 pb-3 text-[11px] font-medium text-t3 sm:px-5",
            )}
          >
            <span role="columnheader">#</span>
            <span role="columnheader">Repository</span>
            <span role="columnheader" className="text-right">
              Stars
            </span>
            <span role="columnheader" className="hidden text-right sm:block">
              Forks
            </span>
            <span role="columnheader" className="hidden sm:block">
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
                "rounded-[28px] px-4 py-3 sm:px-5",
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
                  className="group flex min-w-0 items-center gap-3 rounded-lg"
                >
                  <Avatar className="size-8 shrink-0">
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
                      className="block truncate text-sm font-medium text-foreground"
                      title={repo.fullName}
                    >
                      {repo.name}
                    </strong>
                    <span className="block truncate text-xs text-t3">
                      @{repo.ownerLogin}
                    </span>
                    {repo.description && (
                      <span
                        className="mt-1 block truncate text-[11px] text-t3"
                        title={repo.description}
                      >
                        {repo.description}
                      </span>
                    )}
                  </span>
                </a>
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
                className="hidden items-center justify-end gap-1.5 text-sm tabular text-t3 sm:inline-flex"
              >
                <BranchingPathsUpIcon size={12} aria-hidden />
                {formatCount(repo.forks)}
              </span>
              <span
                role="cell"
                className="hidden truncate text-xs text-t3 sm:block"
              >
                {repo.language ?? "—"}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      {repositories.length > limit && (
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
