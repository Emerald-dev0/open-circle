/**
 * Lets a page with unsaved work intercept app navigation (dock, back links).
 * The guard returns true when it takes over, e.g. to ask "Leave your unsaved
 * changes?", and calls `proceed` later if the person confirms.
 */
type Guard = (proceed: () => void) => boolean;

let current: Guard | null = null;

export function setLeaveGuard(guard: Guard | null) {
  current = guard;
}

export function guardedLeave(proceed: () => void) {
  if (!current?.(proceed)) proceed();
}
