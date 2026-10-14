import { CrownIcon, StarIcon, UserPlusRoundedIcon } from "@solar-icons/react/bold-duotone";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { diceBearAvatarUrl, formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LeaderboardEntry = {
  id: string;
  name: string;
  points: number;
  /** GitHub login, shown as @handle. */
  handle: string;
  stars: number;
  href: string;
  /** The member's GitHub avatar; DiceBear stands in when it's missing. */
  avatarUrl?: string;
  /** Stable string so the same person always gets the same face. */
  seed: string;
  avatarBg?: string;
};

function PodiumSlot({
  entry,
  rank,
  blockHeight,
  isCurrentUser,
  flash,
}: {
  entry: LeaderboardEntry | null;
  rank: 1 | 2 | 3;
  blockHeight: string;
  isCurrentUser?: boolean;
  flash?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center" id={entry ? `member-${entry.id}` : undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={entry?.id ?? `open-${rank}`}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className={cn("relative mb-3 flex flex-col items-center rounded-2xl px-1.5 pt-1", flash && "animate-row-flash")}
        >
          {rank === 1 && (
            <CrownIcon size={26} className="mb-1.5 text-alva-accent" aria-hidden />
          )}

          {entry ? (
            <>
              <a
                href={entry.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center"
                aria-label={`${entry.name}, rank ${rank}, ${formatFull(entry.points)} points. Open GitHub profile @${entry.handle}`}
              >
                <Avatar
                  className={cn(
                    "size-11 border-2 transition-transform group-hover:scale-105 sm:size-14",
                    isCurrentUser ? "border-alva-accent" : "border-transparent"
                  )}
                >
                  <AvatarImage src={entry.avatarUrl ?? diceBearAvatarUrl(entry.seed, entry.avatarBg)} alt="" />
                  <AvatarFallback className="bg-alva-card text-xs font-medium text-foreground">
                    {entry.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <p className="mt-2 max-w-[88px] truncate text-center text-xs font-medium text-foreground sm:max-w-[140px] sm:text-sm">
                  {entry.name}
                </p>
                <p className="max-w-[88px] truncate text-center text-[10px] text-t4 group-hover:text-t3 sm:max-w-[140px] sm:text-xs">
                  @{entry.handle}
                </p>
              </a>

              <span className="mt-1.5 rounded-full bg-alva-surface px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular sm:text-xs">
                {entry.points.toLocaleString()} pts
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-t3 tabular sm:text-xs">
                <StarIcon size={11} aria-hidden />
                {formatCount(entry.stars)}
                <span className="sr-only"> stars</span>
              </span>
            </>
          ) : (
            <>
              <span className="flex size-11 items-center justify-center rounded-full bg-alva-surface text-t4 sm:size-14">
                <UserPlusRoundedIcon size={18} aria-hidden />
              </span>
              <p className="mt-2 text-xs font-medium text-t3 sm:text-sm">#{rank} open</p>
              <span className="mt-1.5 rounded-full bg-alva-surface/60 px-2.5 py-0.5 text-[10px] font-medium text-t4 sm:text-xs">
                take it
              </span>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* The bar. 85% of the slot so the shortest one still reads as a block
          rather than a line, and the rank sits inside it rather than under it. */}
      <div className={cn("relative w-full", blockHeight)}>
        <div
          className="absolute inset-x-0 bottom-0 h-[85%] overflow-hidden rounded-t-[22px]"
          style={{
            background:
              "linear-gradient(180deg, hsl(0 0% 96%) 0%, hsl(0 0% 80%) 40%, hsl(0 0% 58%) 100%)",
          }}
        >
          {/* Top lip. Catches light on the leading edge so the bar reads as a
              solid with a top face, not a flat rectangle. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/70 to-transparent"
          />

          <span className="absolute inset-x-0 top-5 flex justify-center text-4xl font-bold text-black/25" aria-hidden>
            {rank}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Second, first, third — in that order on screen.
 *
 * The winner is centre and tallest, which is the shape everyone already reads
 * without a legend. Ranking them 1-2-3 left to right would be a list, and a
 * list does not need a podium.
 *
 * `entries` is in rank order; missing places render as open slots so the
 * podium keeps its shape before three people have joined.
 */
export function LeaderboardPodium({
  entries,
  currentUserId,
  flashId,
  className,
}: {
  entries: LeaderboardEntry[];
  currentUserId?: string | null;
  flashId?: string | null;
  className?: string;
}) {
  const [first = null, second = null, third = null] = entries;

  return (
    <div className={cn("relative", className)} role="list" aria-label="Top three">
      {/* Fades the bars into the page bottom, so they look like they continue
          past the edge rather than being cut off by it. A mask rather than a
          colour overlay, so it blends into the gradient backdrop too. */}
      <div className="relative flex items-end justify-center gap-1.5 px-1 [mask-image:linear-gradient(to_bottom,#000_calc(100%-90px),transparent)] sm:gap-3">
        {([
          [second, 2, "h-[170px] sm:h-[220px]"],
          [first, 1, "h-[240px] sm:h-[300px]"],
          [third, 3, "h-[125px] sm:h-[165px]"],
        ] as const).map(([entry, rank, height]) => (
          <div key={rank} role="listitem" className="flex min-w-0 flex-1">
            <PodiumSlot
              entry={entry}
              rank={rank}
              blockHeight={height}
              isCurrentUser={!!entry && entry.id === currentUserId}
              flash={!!entry && entry.id === flashId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
