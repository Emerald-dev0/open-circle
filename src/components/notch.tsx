import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { AltArrowLeftIcon } from "@solar-icons/react/linear";
import { LiquidGlass } from "@/components/liquid-glass";

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/**
 * Dynamic-island header for inner pages that don't have the dock. Drops in
 * from the top, shows back + title + the page's actions, and tucks the
 * actions away once you scroll (hover or focus brings them back).
 */
export function Notch({
  title,
  children,
  backTo = "/",
  backLabel = "Back to the board",
  onBack,
  showBack = true,
}: {
  title: ReactNode;
  children?: ReactNode;
  backTo?: string;
  backLabel?: string;
  onBack?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  showBack?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const expanded = !scrolled || hovered;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex justify-center px-3">
      <motion.div
        initial={{ y: -28, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={SPRING}
        className="pointer-events-auto max-w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false); }}
      >
        <LiquidGlass radius={9999} layout transition={SPRING} className="flex max-w-full items-center gap-1 p-1.5">
          <motion.div layout="position" transition={SPRING} className="flex min-w-0 items-center gap-1.5">
            {showBack && <Link
              to={backTo}
              onClick={onBack}
              aria-label={backLabel}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-t3 transition-colors hover:bg-white/[0.07] hover:text-foreground"
            >
              <AltArrowLeftIcon className="size-[18px]" aria-hidden />
            </Link>}
            <span className={`truncate text-sm font-medium tracking-[-0.01em] ${showBack ? "pr-2" : "px-3"}`}>{title}</span>
          </motion.div>
          <AnimatePresence initial={false}>
            {children && expanded && (
              <motion.div
                key="actions"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={SPRING}
                className="flex shrink-0 items-center gap-1.5 overflow-visible"
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </LiquidGlass>
      </motion.div>
    </div>
  );
}
