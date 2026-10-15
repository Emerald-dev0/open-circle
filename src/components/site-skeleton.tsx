import { Skeleton } from "skelo";
import { LoadingSkeleton, SkeletonPlaceholder as Placeholder } from "@/components/loading-skeleton";

export function BoardSkeleton({ repositories = false }: { repositories?: boolean }) {
  return <LoadingSkeleton label={repositories ? "Loading repositories…" : "Loading developer rankings…"}>
    <div className="space-y-6 py-6">
      <Skeleton animation="pulse" template={<div className="flex justify-center gap-8 py-4 sm:gap-16">
        {[0, 1, 2].map((index) => <div key={index} className="flex min-w-0 flex-col items-center gap-3">
          <Placeholder circle className="size-10 sm:size-12" />
          <Placeholder className="h-2.5 w-14" />
        </div>)}
      </div>} />
      <div className="space-y-2">
        {["w-40", "w-32", "w-48"].map((width) => <Skeleton key={width} animation="pulse" template={<div className="flex min-w-0 items-center gap-3 px-3 py-4 sm:px-5">
          <Placeholder circle className="size-8 shrink-0" />
          <div className="min-w-0 flex-1"><Placeholder className={`h-3 ${width}`} /></div>
          <Placeholder className="h-3 w-8 shrink-0" />
        </div>} />)}
      </div>
    </div>
  </LoadingSkeleton>;
}

export function ToolsSkeleton() {
  return <LoadingSkeleton label="Loading tools…" className="mt-5">
    <div className="space-y-2">
      {["w-32", "w-24", "w-36"].map((width) => <Skeleton key={width} animation="pulse" template={<div className="flex min-w-0 items-center gap-3 px-4 py-5 sm:px-5">
        <Placeholder className="size-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Placeholder className={`h-3 ${width}`} />
          <Placeholder className="h-2.5 w-64" />
        </div>
      </div>} />)}
    </div>
  </LoadingSkeleton>;
}

export function AccountSkeleton() {
  return <LoadingSkeleton label="Checking GitHub sign-in…">
    <Skeleton animation="pulse" template={<Placeholder className="h-10 w-28 rounded-full" />} />
  </LoadingSkeleton>;
}

export function CommunityVotesSkeleton() {
  return <LoadingSkeleton label="Loading community upvotes…">
    <Skeleton animation="pulse" template={<div className="py-1"><Placeholder className="h-3 w-40" /></div>} />
  </LoadingSkeleton>;
}

export function ParticipationSkeleton({ checkingSignIn = false }: { checkingSignIn?: boolean }) {
  return <LoadingSkeleton label={checkingSignIn ? "Checking sign-in…" : "Loading your participation…"}>
    <Skeleton animation="pulse" template={<div className="flex flex-col gap-4 py-8">
      <Placeholder className="h-4 w-32" />
      <Placeholder className="h-3 w-64" />
      <Placeholder className="h-3 w-48" />
    </div>} />
  </LoadingSkeleton>;
}
