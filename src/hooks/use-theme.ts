import { createContext, useContext } from "react";
import type { ResolvedTheme, Theme } from "@/lib/theme";

export const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}>({ theme: "system", resolvedTheme: "dark", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}
