import type { IconBaseProps } from "react-icons";
import { FaGithub, FaWhatsapp } from "react-icons/fa6";

export function WhatsAppIcon(props: IconBaseProps) {
  return <FaWhatsapp aria-hidden="true" {...props} />;
}

export function GitHubIcon(props: IconBaseProps) {
  return <FaGithub aria-hidden="true" {...props} />;
}
