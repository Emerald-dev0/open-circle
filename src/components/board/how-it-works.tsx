import { DEFAULT_WEIGHTS } from "@shared/ranking";
import type { Weights } from "@shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function HowItWorks({
  open,
  onOpenChange,
  weights = DEFAULT_WEIGHTS,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weights?: Weights;
}) {
  const rows: [string, string][] = [
    ["Star on a repo you own", `${weights.stars}`],
    ["Follower", `${weights.followers}`],
    [`Public repo, up to ${weights.reposCap}`, `${weights.repos}`],
    [`Contribution in 30 days, up to ${weights.activityCap}`, `${weights.activity}`],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-[28px] border-0 bg-[hsl(218_29%_9%)] p-6 shadow-none sm:rounded-[28px]">
        <DialogTitle className="text-base font-medium tracking-tight">How ranking works</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-t4">Points per item, from your public GitHub.</DialogDescription>

        <dl className="mt-5 space-y-2.5 text-sm">
          {rows.map(([what, pts]) => (
            <div key={what} className="flex items-baseline justify-between gap-4">
              <dt className="text-t3">{what}</dt>
              <dd className="whitespace-nowrap font-medium tabular text-foreground">{pts} pts</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-xs text-t4">Ties go to more stars. Forks and private repos don't count.</p>
      </DialogContent>
    </Dialog>
  );
}
