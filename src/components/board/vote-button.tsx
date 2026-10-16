import type { ButtonHTMLAttributes } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from "@solar-icons/react/linear";
import { TextureButton } from "@/components/ui/texture-button";
import { cn } from "@/lib/utils";
import "./vote-button.css";

interface VoteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction?: "up" | "down";
  selected: boolean;
  loading?: boolean;
}

export function VoteButton({ direction = "up", selected, className, ...props }: VoteButtonProps) {
  const Icon = selected ? CheckIcon : direction === "up" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TextureButton
      {...props}
      variant="icon"
      size="icon"
      aria-pressed={selected}
      data-direction={direction}
      className={cn("vote-button size-10 w-10 sm:size-11 sm:w-11", className)}
      innerClassName="p-0"
    >
      <Icon className="size-4" aria-hidden="true" />
    </TextureButton>
  );
}
