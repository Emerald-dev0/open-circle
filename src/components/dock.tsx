import { useEffect, useState } from "react";
import { MetalText } from "metal-fx";
import { motion, useSpring, useTransform } from "motion/react";
import { CupStarIcon, InfoCircleIcon } from "@solar-icons/react/bold-duotone";
import { WhatsAppIcon } from "@/components/brand-icons";
import { toast } from "sonner";
import { BRAND_NAME, DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "@shared/brand";
import type { InviteConfig } from "@shared/types";
import { LiquidGlass } from "@/components/liquid-glass";

const BRAND_FONT = "650 15px/1 Aspekta, ui-sans-serif, system-ui, sans-serif";
const SLOT = 40;
const PEAK_SCALE = 1.5;

/**
 * A dock icon that swells while hovered, with a label above it. Only the
 * glyph scales (a transform), so the dock never resizes and neighbours stay put.
 */
function DockIcon({
  label,
  children,
  onClick,
  href,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const scale = useSpring(1, { stiffness: 400, damping: 28, mass: 0.2 });
  useEffect(() => scale.set(hovered ? PEAK_SCALE : 1), [hovered, scale]);
  // Rise as it grows so the glyph swells upward, out of the dock.
  const y = useTransform(scale, (s) => -(s - 1) * 14);

  const inner = (
    <>
      <motion.span className="flex size-5 origin-bottom items-center justify-center" style={{ scale, y }}>
        {children}
      </motion.span>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[hsl(218_29%_13%)] px-2.5 py-1 text-xs font-medium text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </>
  );
  const props = {
    "aria-label": label,
    className:
      "group relative flex shrink-0 items-center justify-center rounded-full text-t2 transition-colors hover:text-foreground",
    style: { width: SLOT, height: SLOT },
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && setHovered(true),
    onPointerLeave: () => setHovered(false),
  };

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {inner}
    </button>
  );
}

/** Floating liquid-glass dock in place of a header: metal brand name, then icon actions. */
export function Dock({
  invite,
  onRank,
  onRules,
}: {
  invite?: InviteConfig;
  onRank: () => void;
  onRules: () => void;
}) {
  const inv = invite ?? { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-40 flex justify-center px-3"
    >
      {/* The name sits in its own pill, butted up against the icon dock. */}
      <div className="flex items-center gap-1">
        <LiquidGlass radius={9999} className="flex items-center p-1.5">
          <button
            type="button"
            onClick={onRank}
            className="flex h-10 items-center self-center rounded-full px-3 sm:px-4"
            aria-label={`${BRAND_NAME}, back to top`}
          >
            <MetalText font={BRAND_FONT} color="#F4F7FB" theme="dark">{BRAND_NAME}</MetalText>
          </button>
        </LiquidGlass>
        <LiquidGlass
          radius={9999}
          className="flex items-center gap-1 overflow-visible p-1.5"
        >
          <DockIcon label="Rank me" onClick={onRank}>
            <CupStarIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon label="How ranking works" onClick={onRules}>
            <InfoCircleIcon size="100%" aria-hidden />
          </DockIcon>
          <DockIcon
            label="Join the WhatsApp group"
            href={inv.open ? inv.url : undefined}
            onClick={inv.open ? undefined : () => toast(inv.note || DEFAULT_INVITE_NOTE)}
          >
            <WhatsAppIcon className="size-full" />
          </DockIcon>
        </LiquidGlass>
      </div>
    </nav>
  );
}
