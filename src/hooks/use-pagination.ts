import { useCallback, useMemo, useRef, useState } from "react";

export const PAGE_SIZE = 20;

export function usePagination<T>(items: readonly T[], pageSize = PAGE_SIZE, resetKey = "") {
  const [position, setPosition] = useState({ key: resetKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = position.key === resetKey ? Math.min(position.page, pageCount) : 1;
  const regionRef = useRef<HTMLDivElement>(null);
  if (position.key !== resetKey || position.page !== page) setPosition({ key: resetKey, page });
  const setPage = useCallback((next: number) => {
    setPosition({ key: resetKey, page: Math.max(1, Math.min(pageCount, Math.floor(next) || 1)) });
  }, [resetKey, pageCount]);
  const changePage = useCallback((next: number) => {
    if (next === page) return;
    setPage(next);
    regionRef.current?.focus({ preventScroll: true });
    regionRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [page, setPage]);
  const shown = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return {
    items: shown,
    page, pageSize, total: items.length, setPage, changePage, regionRef,
  };
}
