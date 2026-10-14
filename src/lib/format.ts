const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

/** 1,234 below 10k; 12.4K above, so table cells stay narrow on phones. */
export function formatCount(n: number): string {
  return n < 10_000 ? full.format(n) : compact.format(n);
}

export function formatFull(n: number): string {
  return full.format(n);
}

export function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function githubUrl(login: string): string {
  return `https://github.com/${login}`;
}

/** DiceBear face for when a GitHub avatar fails to load. https://www.dicebear.com */
export function diceBearAvatarUrl(seed: string, backgroundColor = "151515"): string {
  const params = new URLSearchParams({ seed, backgroundColor, radius: "50" });
  return `https://api.dicebear.com/9.x/personas/svg?${params.toString()}`;
}
