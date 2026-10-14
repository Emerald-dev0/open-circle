export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="brand-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <rect x="10" y="30" width="13" height="24" rx="3" fill="url(#brand-bar)" opacity=".7" />
      <rect x="25.5" y="12" width="13" height="42" rx="3" fill="url(#brand-bar)" />
      <rect x="41" y="38" width="13" height="16" rx="3" fill="url(#brand-bar)" opacity=".5" />
    </svg>
  );
}
