import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext } from "@/hooks/use-theme";
import { applyTheme, parseTheme, readTheme, THEME_KEY, THEME_QUERY, type ResolvedTheme, type Theme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(readTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => window.matchMedia(THEME_QUERY).matches ? "dark" : "light");
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia(THEME_QUERY);
    const change = () => setSystemTheme(media.matches ? "dark" : "light");
    change();
    media.addEventListener("change", change);
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) updateTheme(readTheme());
    };
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);

  const setTheme = (value: Theme) => {
    const next = parseTheme(value);
    updateTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { return; }
  };

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}
