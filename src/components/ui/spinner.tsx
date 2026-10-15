import { Star2Icon } from "@solar-icons/react/linear";
import { cn } from "@/lib/utils";

/** The app's one loading indicator: a slowly turning Solar star. */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Star2Icon size={size} aria-hidden="true" className={cn("shrink-0 animate-spin [animation-duration:1.1s]", className)} />;
}
