import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  const titleId = useId();

  return (
    <div className={cn("flex min-w-0 flex-col items-center px-4 py-14 text-center sm:py-16", className)}>
      <div role="status" aria-labelledby={titleId} aria-atomic="true" className="flex max-w-sm flex-col items-center">
        <div aria-hidden="true" className="mb-6 flex size-16 shrink-0 items-center justify-center rounded-2xl bg-foreground/[0.05] text-t2">
          {icon}
        </div>
        <h3 id={titleId} className="max-w-full break-words text-lg font-medium tracking-[-0.02em] text-foreground">
          {title}
        </h3>
        <div className="mt-2 max-w-full break-words text-sm leading-relaxed text-t3">{description}</div>
      </div>
      {children && <div className="mt-6 flex max-w-full flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}
