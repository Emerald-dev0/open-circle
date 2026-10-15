import type { CommunityTool, VoteValue } from "@shared/community";
import { ArrowDownIcon, ArrowUpIcon, BookmarkIcon, SquareArrowRightUpIcon } from "@solar-icons/react/linear";
import { BookmarkIcon as BookmarkFilledIcon } from "@solar-icons/react/bold";
import { ToolFavicon } from "@/components/board/tool-favicon";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

interface Props {
  tool: CommunityTool;
  count: number;
  value: VoteValue;
  saved: boolean;
  disabled: boolean;
  onVote: (value: VoteValue) => void;
  onSave: () => void;
}

export function ToolRow({ tool, count, value, saved, disabled, onVote, onSave }: Props) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ layout: { type: "spring", stiffness: 340, damping: 34 }, opacity: { duration: 0.2 } }}
      className="surface-quiet grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[24px] px-4 py-3 sm:gap-x-4 sm:px-5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <a href={tool.url} target="_blank" rel="noopener noreferrer" className="touch-target group inline-flex min-h-8 max-w-full items-center gap-2 rounded text-sm font-medium text-foreground">
            <ToolFavicon url={tool.url} />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{tool.name}</span>
            <SquareArrowRightUpIcon className="size-3 shrink-0 text-t3 group-hover:text-foreground" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span className="text-[11px] text-t4">{tool.category}</span>
        </div>
        <p className="mt-1 max-w-[65ch] break-words text-xs leading-relaxed text-t2 [overflow-wrap:anywhere]">{tool.description}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-t3">
          {tool.source === "curated" && tool.sourceUrl ? (
            <a href={tool.sourceUrl} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex min-h-8 items-center gap-1.5 rounded hover:text-foreground">Source<SquareArrowRightUpIcon className="size-3" aria-hidden="true" /><span className="sr-only"> for {tool.name} (opens in a new tab)</span></a>
          ) : <span>{tool.source === "curated" ? "Curated" : "Community"}</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`${saved ? "Unsave" : "Save"} ${tool.name}`} aria-pressed={saved} onClick={onSave} className="touch-target inline-flex min-h-8 items-center gap-1.5 rounded hover:text-foreground">
                {saved ? <BookmarkFilledIcon className="size-3.5 text-foreground" aria-hidden="true" /> : <BookmarkIcon className="size-3.5" aria-hidden="true" />}
                <span aria-hidden="true">{saved ? "Saved" : "Save"}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{saved ? "Remove saved tool" : "Save in this browser"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* Votes sit on the right of the same line: stacked on phones, a pill from sm up. */}
      <div role="group" aria-label={`Vote on ${tool.name}`} className="flex flex-col items-center gap-0.5 rounded-full bg-white/[0.035] p-0.5 sm:flex-row">
        <TextureButton type="button" variant={value === 1 ? "primary" : "icon"} size="icon" aria-label={`${value === 1 ? "Remove upvote for" : "Upvote"} ${tool.name}`} aria-pressed={value === 1} disabled={disabled} onClick={() => onVote(value === 1 ? 0 : 1)} className="size-10 w-10 sm:size-11 sm:w-11" innerClassName={cn("p-0", value === 1 && "text-up")}>
          <ArrowUpIcon className="size-4" aria-hidden="true" />
        </TextureButton>
        <span className="min-w-8 py-0.5 text-center text-xs font-medium tabular text-t2 sm:px-1 sm:py-0" title={`${formatFull(count)} net votes`} aria-label={`${formatFull(count)} net votes for ${tool.name}`}>{formatCount(count)}</span>
        <TextureButton type="button" variant={value === -1 ? "primary" : "icon"} size="icon" aria-label={`${value === -1 ? "Remove downvote for" : "Downvote"} ${tool.name}`} aria-pressed={value === -1} disabled={disabled} onClick={() => onVote(value === -1 ? 0 : -1)} className="size-10 w-10 sm:size-11 sm:w-11" innerClassName={cn("p-0", value === -1 && "text-down")}>
          <ArrowDownIcon className="size-4" aria-hidden="true" />
        </TextureButton>
      </div>
    </motion.li>
  );
}
