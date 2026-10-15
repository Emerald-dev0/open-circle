import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "skelo/styles.css";
import "./loading-skeleton.css";

export function LoadingSkeleton({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={cn("loading-skeleton min-w-0", className)}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}

export function SkeletonPlaceholder({ className, circle = false }: { className: string; circle?: boolean }) {
  return <div data-skeleton-shape={circle ? "circle" : "rect"} className={cn("max-w-full rounded-md", circle && "rounded-full", className)} />;
}
