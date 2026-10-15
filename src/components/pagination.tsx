import type { ReactNode } from "react";
import { TextureButton } from "@/components/ui/texture-button";
import { usePagination } from "@/hooks/use-pagination";
import { formatFull } from "@/lib/format";

export function Pagination({ page, pageSize, total, onPageChange, label, disabled = false }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  return <nav aria-label={`${label} pagination`} className="mt-5 space-y-2 pb-2">
    <p role="status" className="text-center text-xs tabular text-t3">{formatFull((page - 1) * pageSize + 1)}–{formatFull(Math.min(page * pageSize, total))} of {formatFull(total)}</p>
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <TextureButton type="button" variant="minimal" className="min-h-11 w-auto" innerClassName="px-3 text-sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</TextureButton>
      <span className="px-2 text-xs tabular text-t3 sm:hidden">Page {formatFull(page)} of {formatFull(pages)}</span>
      <div className="hidden items-center gap-1.5 sm:flex">
        {numbers.map((value, index) => <span key={value} className="inline-flex items-center gap-1.5">
          {index > 0 && value - numbers[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-t3">…</span>}
          <TextureButton type="button" variant={page === value ? "primary" : "minimal"} className="min-h-11 min-w-11 w-auto" innerClassName="px-3 text-sm tabular" aria-label={`Go to page ${value}`} aria-current={page === value ? "page" : undefined} disabled={disabled} onClick={() => onPageChange(value)}>{formatFull(value)}</TextureButton>
        </span>)}
      </div>
      <TextureButton type="button" variant="minimal" className="min-h-11 w-auto" innerClassName="px-3 text-sm" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>Next</TextureButton>
    </div>
  </nav>;
}

export function PaginatedList<T>({ items, label, children, pageSize = 10, resetKey = "", ordered = false, className, disabled = false }: {
  items: readonly T[];
  label: string;
  children: (item: T) => ReactNode;
  pageSize?: number;
  resetKey?: string;
  ordered?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const pagination = usePagination(items, pageSize, resetKey);
  const List = ordered ? "ol" : "ul";
  return <div ref={pagination.regionRef} tabIndex={-1} className="scroll-mt-6">
    <List aria-label={label} className={className} start={ordered ? (pagination.page - 1) * pageSize + 1 : undefined}>{pagination.items.map(children)}</List>
    <Pagination {...pagination} label={label} disabled={disabled} onPageChange={pagination.changePage} />
  </div>;
}
