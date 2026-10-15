"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// cult-ui Texture Button (https://www.cult-ui.com/docs/components/texture-button).
// Borders are removed to keep the page border-free; the 1px gradient rim
// (padding over a gradient) still gives the bevel. Metal-wrapped buttons get
// their edge from MetalFx instead, see metal-button.tsx.
const buttonVariantsOuter = cva(
  "touch-target inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer select-none no-underline disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:min-w-0",
  {
    variants: {
      variant: {
        primary:
          "w-full bg-gradient-to-b from-black/70 to-black p-[1px] transition duration-300 ease-in-out dark:from-white/25 dark:to-white/5",
        accent:
          "w-full bg-gradient-to-b from-indigo-300/90 to-indigo-500 p-[1px] transition duration-300 ease-in-out dark:from-indigo-200/70 dark:to-indigo-500",
        destructive:
          "w-full bg-gradient-to-b from-red-300/90 to-red-500 p-[1px] transition duration-300 ease-in-out dark:from-red-300/90 dark:to-red-500",
        secondary:
          "w-full bg-white/50 p-[1px] transition duration-300 ease-in-out dark:bg-neutral-600/50",
        minimal:
          "group/texture-button w-full bg-white/50 to-white p-[1px] hover:bg-gradient-to-t hover:from-neutral-100 active:bg-neutral-200 dark:bg-neutral-600/80 dark:hover:from-neutral-600/50 dark:hover:to-neutral-600/70 dark:active:bg-neutral-800",
        icon: "group/texture-button rounded-full bg-white/50 to-white p-[1px] hover:bg-gradient-to-t hover:from-neutral-100 active:bg-neutral-200 dark:bg-neutral-600/50 dark:hover:from-neutral-700 dark:hover:to-neutral-600 dark:active:bg-neutral-800",
      },
      size: {
        sm: "rounded-full",
        default: "rounded-full",
        lg: "rounded-full",
        icon: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

const innerDivVariants = cva(
  "text-muted-foreground flex w-full self-stretch items-center justify-center whitespace-nowrap font-medium",
  {
    variants: {
      variant: {
        primary:
          "gap-2 bg-gradient-to-b from-neutral-800 to-black text-sm text-white/90 transition duration-300 ease-in-out hover:from-stone-800 hover:to-neutral-800/70 active:bg-gradient-to-b active:from-black active:to-black dark:from-neutral-700 dark:to-neutral-900 dark:text-white/90 dark:hover:from-neutral-600 dark:hover:to-neutral-800 dark:active:from-neutral-800 dark:active:to-neutral-900",
        accent:
          "gap-2 bg-gradient-to-b from-indigo-400 to-indigo-600 text-sm text-white/90 transition duration-300 ease-in-out hover:bg-gradient-to-b hover:from-indigo-400/70 hover:to-indigo-600/70 active:bg-gradient-to-b active:from-indigo-400/80 active:to-indigo-600/80 dark:hover:from-indigo-400/70 dark:hover:to-indigo-600/70 dark:active:from-indigo-400 dark:active:to-indigo-600",
        destructive:
          "gap-2 bg-gradient-to-b from-red-400/60 to-red-500/60 text-sm text-white/90 transition duration-300 ease-in-out hover:bg-gradient-to-b hover:from-red-400/70 hover:to-red-600/70 active:bg-gradient-to-b active:from-red-400/80 active:to-red-600/80 dark:hover:from-red-400/70 dark:hover:to-red-500/80 dark:active:from-red-400 dark:active:to-red-500",
        secondary:
          "gap-2 bg-gradient-to-b from-neutral-100/80 to-neutral-200/50 text-sm transition duration-300 ease-in-out hover:bg-gradient-to-b hover:from-neutral-200/40 hover:to-neutral-300/60 active:bg-gradient-to-b active:from-neutral-200/60 active:to-neutral-300/70 dark:from-neutral-800 dark:to-neutral-700/50 dark:text-white/85 dark:hover:from-neutral-700 dark:hover:to-neutral-700/60 dark:active:from-neutral-800 dark:active:to-neutral-700",
        minimal:
          "gap-2 bg-gradient-to-b from-white to-neutral-50/50 text-sm transition duration-300 ease-in-out group-hover/texture-button:bg-gradient-to-b group-hover/texture-button:from-neutral-50/50 group-hover/texture-button:to-neutral-100/60 group-active/texture-button:bg-gradient-to-b group-active/texture-button:from-neutral-100/60 group-active/texture-button:to-neutral-100/90 dark:from-neutral-800 dark:to-neutral-700/50 dark:text-white/80 dark:group-hover/texture-button:from-neutral-700 dark:group-hover/texture-button:to-neutral-700/60 dark:group-active/texture-button:from-neutral-800 dark:group-active/texture-button:to-neutral-700",
        icon: "rounded-full bg-gradient-to-b from-white to-neutral-50/50 group-active/texture-button:bg-neutral-200 dark:from-neutral-800 dark:to-neutral-700/50 dark:text-white/80 dark:group-active/texture-button:bg-neutral-800",
      },
      size: {
        sm: "rounded-full px-3.5 py-1.5 text-xs",
        default: "rounded-full px-5 py-2.5 text-sm",
        lg: "rounded-full px-6 py-3 text-base",
        icon: "rounded-full p-1",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface UnifiedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "accent"
    | "destructive"
    | "minimal"
    | "icon"
  size?: "default" | "sm" | "lg" | "icon"
  /** Render the single child element (e.g. an `<a>`) as the button. */
  asChild?: boolean
  innerClassName?: string
}

const TextureButton = React.forwardRef<HTMLButtonElement, UnifiedButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "default",
      asChild = false,
      className,
      innerClassName,
      ...props
    },
    ref
  ) => {
    const outer = cn(buttonVariantsOuter({ variant, size }), className)
    const inner = cn(innerDivVariants({ variant, size }), innerClassName)

    // Slot merges into its only child, so the textured face goes inside that
    // child rather than around it; otherwise an <a> would end up nested in a div.
    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      return (
        <Slot className={outer} ref={ref} {...props}>
          {React.cloneElement(children, undefined, <span className={inner}>{children.props.children}</span>)}
        </Slot>
      )
    }

    return (
      <button className={outer} ref={ref} {...props}>
        <span className={inner}>{children}</span>
      </button>
    )
  }
)

TextureButton.displayName = "TextureButton"

export { TextureButton }
