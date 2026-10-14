import { AltArrowDownIcon, AltArrowUpIcon } from "@solar-icons/react/bold";
import { cn } from "@/lib/utils";

/** Rank change since the last move. Arrow plus number, so it never relies on colour alone. */
export function Movement({ delta, isNew, className }: { delta: number; isNew: boolean; className?: string }) {
  if (delta > 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-up tabular", className)}>
        <AltArrowUpIcon size={12} aria-hidden />
        {delta}
        <span className="sr-only"> places up</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-down tabular", className)}>
        <AltArrowDownIcon size={12} aria-hidden />
        {-delta}
        <span className="sr-only"> places down</span>
      </span>
    );
  }
  if (isNew) {
    return <span className={cn("text-[10px] font-semibold uppercase tracking-[0.08em] text-t2", className)}>New</span>;
  }
  return (
    <span className={cn("text-t4", className)} aria-label="No change">
      –
    </span>
  );
}
