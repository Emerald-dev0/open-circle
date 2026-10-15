import { useState } from "react";
import { FiGlobe } from "react-icons/fi";

export function ToolFavicon({ url }: { url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hostname = new URL(url).hostname;

  return (
    <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
      {failedUrl === url ? (
        <FiGlobe className="size-5 text-t3" />
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-6 rounded bg-white/90 object-contain p-0.5"
          onError={() => setFailedUrl(url)}
        />
      )}
    </span>
  );
}
