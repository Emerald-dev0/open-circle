import type { CommunityTool, VoteValue } from "@shared/community";
import { ArrowDownIcon, ArrowUpIcon, BookmarkIcon, SquareArrowRightUpIcon } from "@solar-icons/react/linear";
import { BookmarkIcon as BookmarkFilledIcon } from "@solar-icons/react/bold";
import { ToolFavicon } from "@/components/board/tool-favicon";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

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
    <li className="surface-quiet grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-x-3 gap-y-2 rounded-2xl px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_2.75rem] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={tool.url} target="_blank" rel="noopener noreferrer" className="touch-target group inline-flex min-h-11 max-w-full items-center gap-2 rounded text-sm font-medium text-foreground sm:min-h-6">
            <ToolFavicon url={tool.url} />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{tool.name}</span>
            <SquareArrowRightUpIcon className="size-3 shrink-0 text-t3 group-hover:text-foreground" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span className="text-xs text-t3">{tool.category}</span>
        </div>
        <p className="mt-1 max-w-[65ch] break-words text-xs leading-relaxed text-t2 [overflow-wrap:anywhere]">{tool.description}</p>
        <div className="mt-1 text-xs text-t3">
          {tool.source === "curated" && tool.sourceUrl ? (
            <a href={tool.sourceUrl} target="_blank" rel="noopener noreferrer" className="touch-target inline-flex min-h-11 items-center gap-1.5 rounded hover:text-foreground sm:min-h-6">Source<SquareArrowRightUpIcon className="size-3" aria-hidden="true" /><span className="sr-only"> for {tool.name} (opens in a new tab)</span></a>
          ) : <span>{tool.source === "curated" ? "Curated" : "Community"}</span>}
        </div>
      </div>
      <div role="group" aria-label={`Vote on ${tool.name}`} className="col-span-2 row-start-2 flex w-fit items-center gap-0.5 rounded-full bg-white/[0.035] p-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <TextureButton type="button" variant={value === 1 ? "primary" : "icon"} size="icon" aria-label={`${value === 1 ? "Remove upvote for" : "Upvote"} ${tool.name}`} aria-pressed={value === 1} disabled={disabled} onClick={() => onVote(value === 1 ? 0 : 1)} className="size-11 w-11" innerClassName={cn("p-0", value === 1 && "text-up")}>
          <ArrowUpIcon className="size-4" aria-hidden="true" />
        </TextureButton>
        <span className="min-w-8 px-1 text-center text-xs font-medium tabular text-t2" title={`${formatFull(count)} net votes`} aria-label={`${formatFull(count)} net votes for ${tool.name}`}>{formatCount(count)}</span>
        <TextureButton type="button" variant={value === -1 ? "primary" : "icon"} size="icon" aria-label={`${value === -1 ? "Remove downvote for" : "Downvote"} ${tool.name}`} aria-pressed={value === -1} disabled={disabled} onClick={() => onVote(value === -1 ? 0 : -1)} className="size-11 w-11" innerClassName={cn("p-0", value === -1 && "text-down")}>
          <ArrowDownIcon className="size-4" aria-hidden="true" />
        </TextureButton>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <TextureButton type="button" variant="icon" size="icon" aria-label={`${saved ? "Unsave" : "Save"} ${tool.name}`} aria-pressed={saved} onClick={onSave} className="col-start-2 row-start-1 size-11 shrink-0 sm:col-start-3">
            {saved ? <BookmarkFilledIcon className="size-4 text-foreground" aria-hidden="true" /> : <BookmarkIcon className="size-4" aria-hidden="true" />}
          </TextureButton>
        </TooltipTrigger>
        <TooltipContent>{saved ? "Remove saved tool" : "Save in this browser"}</TooltipContent>
      </Tooltip>
    </li>
  );
}
