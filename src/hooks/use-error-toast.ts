import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Errors show as a toast, never inline. Fires once per new error object;
 * the id keeps a repeating error (e.g. a failing poll) as one toast.
 */
export function useErrorToast(
  error: unknown,
  fallback: string,
  options: { id?: string; retry?: () => void } = {},
) {
  const { id, retry } = options;
  useEffect(() => {
    if (!error) return;
    const message = error instanceof Error && error.message ? error.message : fallback;
    toast.error(message, {
      id,
      action: retry ? { label: "Try again", onClick: retry } : undefined,
    });
    // `retry` is a fresh closure each render; the error is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, fallback, id]);
}
