import type * as React from "react";
import { cn } from "@/lib/utils";

/** Outer frame holding a header card and a body card, like a status console. */
export function Panel({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] bg-foreground/[0.06] p-1.5 sm:rounded-[34px] sm:p-2">
      <div className="rounded-[24px] bg-card px-4 py-4 sm:rounded-[28px] sm:px-6 sm:py-5">{header}</div>
      <div className="mt-1.5 rounded-[24px] bg-card px-4 sm:mt-2 sm:rounded-[28px] sm:px-6">{children}</div>
    </section>
  );
}

export function PanelHeader({ title, subtitle, chip }: { title: string; subtitle?: string; chip?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-medium tracking-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-t3">{subtitle}</p>}
      </div>
      {chip}
    </div>
  );
}

export function Chip({ tone, children, icon }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode; icon?: React.ReactNode }) {
  const dot = tone === "ok" ? "bg-[hsl(var(--up))]" : tone === "warn" ? "bg-[hsl(var(--warn))]" : "bg-t4";
  const iconColor = tone === "ok" ? "text-[hsl(var(--up))]" : tone === "warn" ? "text-[hsl(var(--warn))]" : "text-t3";
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-medium text-t2">
      {icon ? <span className={cn("inline-flex shrink-0 [&_svg]:size-3.5", iconColor)} aria-hidden>{icon}</span> : <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />}
      {children}
    </span>
  );
}

/** One key/value line. Stacks on phones when the value is a wide control. */
export function Row({ label, htmlFor, stack, children }: { label: string; htmlFor?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-2 border-b border-foreground/[0.06] py-3.5 last:border-0 sm:items-center sm:gap-6",
        stack ? "flex-col sm:flex-row" : "items-center justify-between",
      )}
    >
      <label htmlFor={htmlFor} className="shrink-0 text-[13px] text-t3 sm:w-48">
        {label}
      </label>
      <div className={cn("min-w-0", stack ? "w-full sm:flex-1" : "flex justify-end")}>{children}</div>
    </div>
  );
}
