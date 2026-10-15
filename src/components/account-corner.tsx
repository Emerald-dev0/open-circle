import type { ReactNode } from "react";
import { GitHubAccount } from "@/components/github-account";
import { ThemeSelect } from "@/components/theme-select";

/**
 * Top-right account control, the same on every page. Pass children to
 * replace it (admin shows its own session); passing nothing shows the
 * GitHub account menu.
 */
export function AccountCorner(props: { children?: ReactNode; leading?: ReactNode }) {
  return (
    <header className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[calc(1rem+env(safe-area-inset-top))] z-30 flex items-center gap-2 sm:right-[max(1.5rem,env(safe-area-inset-right))] sm:top-[calc(1.5rem+env(safe-area-inset-top))]">
      {props.leading}
      <ThemeSelect />
      {"children" in props ? props.children : <GitHubAccount />}
    </header>
  );
}
