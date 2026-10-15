import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { AltArrowDownIcon, AltArrowUpIcon, CheckIcon } from "@solar-icons/react/linear";
import { cn } from "@/lib/utils";

interface SharedSelectProps extends Pick<React.ComponentPropsWithoutRef<"button">,
  "id" | "name" | "aria-label" | "aria-invalid" | "aria-describedby" | "className" | "disabled"> {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SharedSelect = React.forwardRef<HTMLButtonElement, SharedSelectProps>(
  ({ value, onValueChange, options, placeholder, disabled, className, name, ...props }, ref) => (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
      <SelectPrimitive.Trigger ref={ref} name={name} className={cn("field inline-flex items-center justify-between gap-3 text-left text-sm data-[state=open]:bg-white/10 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate", className)} {...props}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild><AltArrowDownIcon className="size-4 shrink-0 text-t3" aria-hidden="true" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={8} collisionPadding={16} align="start" className="z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-content-available-width)] overflow-hidden rounded-2xl bg-[hsl(var(--alva-card))] p-1.5 text-foreground">
          <SelectPrimitive.ScrollUpButton className="flex h-8 items-center justify-center text-t3"><AltArrowUpIcon className="size-4" aria-hidden="true" /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className="relative flex min-h-11 cursor-pointer select-none items-center rounded-xl py-2 pl-3 pr-9 text-sm text-t2 outline-none data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-foreground data-[state=checked]:text-foreground [&>span]:break-words [&>span]:[overflow-wrap:anywhere]">
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center"><CheckIcon className="size-4" aria-hidden="true" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-8 items-center justify-center text-t3"><AltArrowDownIcon className="size-4" aria-hidden="true" /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
SharedSelect.displayName = "SharedSelect";
