import * as React from "react";
import { MetalFx } from "metal-fx";
import { TextureButton, type UnifiedButtonProps } from "@/components/ui/texture-button";
import { cn } from "@/lib/utils";

interface MetalButtonProps extends UnifiedButtonProps {
  preset?: "chromatic" | "silver" | "gold";
  /** Classes for the MetalFx wrapper, e.g. `w-full` for a full-width button. */
  wrapperClassName?: string;
}

/**
 * A texture button whose edge is a live liquid-metal ring (metal-fx). The
 * ring sits in the 3px gutter around the textured face. Falls back to the
 * plain texture button where WebGL2 isn't available.
 */
export const MetalButton = React.forwardRef<HTMLButtonElement, MetalButtonProps>(
  ({ preset = "chromatic", wrapperClassName, className, size = "default", ...props }, ref) => (
    <MetalFx
      preset={preset}
      theme="dark"
      variant="button"
      strength={0.95}
      className={cn("!bg-transparent", wrapperClassName)}
    >
      <TextureButton
        ref={ref}
        size={size}
        className={cn(size === "sm" ? "rounded-full p-[2.5px]" : "rounded-full p-[3px]", className)}
        {...props}
      />
    </MetalFx>
  ),
);
MetalButton.displayName = "MetalButton";
