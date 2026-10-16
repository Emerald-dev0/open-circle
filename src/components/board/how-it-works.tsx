import { DEFAULT_WEIGHTS } from "@shared/ranking";
import { HELPER_POLICY } from "@shared/coordination";
import { STAR_HELP_POINTS } from "@shared/star-help";
import type { Weights } from "@shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function HowItWorks({
  open,
  onOpenChange,
  weights = DEFAULT_WEIGHTS,
  helpersDelayed = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weights?: Weights;
  helpersDelayed?: boolean;
}) {
  const rows: [string, string][] = [
    ["Star on a repo you own", `${weights.stars}`],
    ["Follower", `${weights.followers}`],
    [`Public repo, up to ${weights.reposCap}`, `${weights.repos}`],
    ["Contribution since joining OpenCircle", `${weights.activity}`],
    ["Community upvote on a repo you own", `${weights.upvotes}`],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm gap-0 overflow-y-auto rounded-[28px] border-0 bg-popover p-6 shadow-none sm:rounded-[28px]">
        <DialogTitle className="pr-8 text-base font-medium tracking-tight">How ranking works</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-t3">Helping other members leads the board.</DialogDescription>

        <dl className="mt-5 space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t3">Confirmed useful contribution</dt><dd className="whitespace-nowrap font-medium tabular">{HELPER_POLICY.contributionPoints} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t3">Each different member helped</dt><dd className="whitespace-nowrap font-medium tabular">+{HELPER_POLICY.peerPoints} pts</dd></div>
          <div className="flex items-baseline justify-between gap-4"><dt className="text-t3">Star another member's repo</dt><dd className="whitespace-nowrap font-medium tabular">{STAR_HELP_POINTS} pts</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-t3">Help counts for {HELPER_POLICY.windowDays} days. Confirmed contributions have a limit of {HELPER_POLICY.dailyLimit} per UTC day and {HELPER_POLICY.perPeerLimit} per recipient. Each project or question counts once. The recipient or an admin must confirm it. Copied feedback and self-reviews earn nothing.</p>
        <p className="mt-3 text-xs leading-relaxed text-t3">Stars given here or directly on GitHub count as help for {HELPER_POLICY.windowDays} days from when you star. Only one star per other visible community member earns points, across all their public, original repos. Self-stars, private repos, forks and nonmembers earn nothing. Removing their last qualifying star removes that member's credit on the next successful GitHub refresh.</p>
        {helpersDelayed && <p role="status" className="mt-3 text-xs leading-relaxed text-t3">Helper scores are waiting for the bot. Previously confirmed points stay visible until it reconnects.</p>}
        <p className="mt-5 text-xs leading-relaxed text-t3">GitHub stats and repo upvotes add at most {HELPER_POLICY.reputationCap} points in total, using these weights:</p>

        <dl className="mt-5 space-y-2.5 text-sm">
          {rows.map(([what, pts]) => (
            <div key={what} className="flex items-baseline justify-between gap-4">
              <dt className="text-t3">{what}</dt>
              <dd className="whitespace-nowrap font-medium tabular text-foreground">{pts} pts</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-xs leading-relaxed text-t3">Ties go to more helper points, then confirmed members helped, GitHub reputation, received stars and joining order. Giving stars is voluntary.</p>
        <p className="mt-3 text-xs leading-relaxed text-t3">Public commits, issues, pull requests, reviews and new repos count from the UTC day you join. These GitHub totals keep adding up; their ranking points stay within the {HELPER_POLICY.reputationCap}-point limit. Removing an upvote removes its points.</p>
        <p className="mt-3 text-xs leading-relaxed text-t3">Spotlight shows one public, original repo per developer with at least 5 stars. We pick the most-starred eligible repo automatically, or you can choose one when joining. Projects rank by stars, then forks, then name.</p>
        <p className="mt-3 text-xs leading-relaxed text-t3">The board checks for updates every 10 seconds. GitHub stats refresh about once a minute, in batches for larger groups.</p>
      </DialogContent>
    </Dialog>
  );
}
