import { Skeleton } from "skelo";
import { Panel, PanelHeader } from "@/components/panel";
import { LoadingSkeleton as LoadingStatus, SkeletonPlaceholder as Placeholder } from "@/components/loading-skeleton";

function OverviewPlaceholder({ heading = false }: { heading?: boolean }) {
  return <div className="space-y-6">
    {heading && <Skeleton animation="pulse" template={<div className="flex items-center justify-between gap-4 py-1">
      <Placeholder className="h-4 w-20" />
      <Placeholder className="h-8 w-24 rounded-full" />
    </div>} />}
    <Skeleton animation="pulse" template={<div className="grid grid-cols-2 gap-x-6 gap-y-8 py-2 sm:grid-cols-4">
      {["w-20", "w-16", "w-24", "w-20"].map((width, index) => <div key={index} className="flex min-w-0 flex-col gap-3">
        <Placeholder className={`h-2.5 ${width}`} />
        <Placeholder className="h-7 w-14" />
      </div>)}
    </div>} />
    <Panel header={<PanelHeader title="Traffic" />}>
      <Skeleton animation="pulse" template={<div className="py-5">
        <Placeholder className="h-40 w-full rounded-lg" />
      </div>} />
    </Panel>
  </div>;
}

export function AdminDashboardSkeleton({ label }: { label: string }) {
  return <LoadingStatus label={label}>
    <div className="space-y-6">
      <Skeleton animation="pulse" template={<div className="flex flex-col gap-3 py-1">
        <Placeholder className="h-7 w-56" />
        <Placeholder className="h-3 w-64" />
      </div>} />
      <div>
        <div className="mb-6">
          <Skeleton animation="pulse" template={<div className="grid w-full grid-cols-4 gap-4 py-3 sm:w-80">
            {[0, 1, 2, 3].map((index) => <Placeholder key={index} className="h-3 w-12" />)}
          </div>} />
        </div>
        <OverviewPlaceholder heading />
      </div>
    </div>
  </LoadingStatus>;
}

export function AdminAnalyticsSkeleton() {
  return <LoadingStatus label="Loading analytics…"><OverviewPlaceholder /></LoadingStatus>;
}

export function AdminToolsSkeleton() {
  return <LoadingStatus label="Loading tools…">
    <div className="space-y-2 py-4">
      {["w-32", "w-24", "w-36"].map((width) => <Skeleton key={width} animation="pulse" template={<div className="flex min-w-0 items-center gap-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Placeholder className={`h-3 ${width}`} />
          <Placeholder className="h-2.5 w-64" />
        </div>
        <Placeholder className="h-7 w-16 shrink-0 rounded-full" />
      </div>} />)}
    </div>
  </LoadingStatus>;
}
