import { toast } from "sonner";
import { DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "@shared/brand";
import type { InviteConfig } from "@shared/types";
import { ChatRoundDotsIcon } from "@solar-icons/react/bold-duotone";
import { MetalButton } from "@/components/metal-button";
import { TextureButton } from "@/components/ui/texture-button";

const FALLBACK: InviteConfig = { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE };

interface Props {
  invite?: InviteConfig;
  size?: "sm" | "default";
  /** Metal ring for the primary placement; the plain texture button elsewhere. */
  metal?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function JoinGroupButton({ invite = FALLBACK, size = "default", metal = true, children, className }: Props) {
  const label = children ?? "Join the group";
  const content = (
    <>
      <ChatRoundDotsIcon size={size === "sm" ? 14 : 16} aria-hidden />
      {label}
    </>
  );
  const Button = metal ? MetalButton : TextureButton;
  const variant = metal ? "primary" : "secondary";

  if (!invite.open) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className ?? "w-auto"}
        onClick={() => toast(invite.note || DEFAULT_INVITE_NOTE)}
      >
        {content}
      </Button>
    );
  }

  return (
    <Button asChild size={size} variant={variant} className={className ?? "w-auto"}>
      <a href={invite.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    </Button>
  );
}
