import { MonitorIcon, MoonIcon, SunIcon } from "@solar-icons/react/linear";
import { SharedSelect } from "@/components/ui/select";
import { useTheme } from "@/hooks/use-theme";
import { parseTheme } from "@/lib/theme";

const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "system" ? MonitorIcon : theme === "dark" ? MoonIcon : SunIcon;
  return <div className="relative w-11 shrink-0 sm:w-32">
    <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-t3 sm:left-3.5 sm:w-auto"><Icon className="size-4" aria-hidden="true" /></span>
    <SharedSelect aria-label="Appearance" className="justify-center gap-0 px-0 sm:justify-between sm:gap-3 sm:pl-10 sm:pr-3 [&>span:first-child]:sr-only sm:[&>span:first-child]:not-sr-only [&>svg]:hidden sm:[&>svg]:block" value={theme} onValueChange={(value) => setTheme(parseTheme(value))} options={options} />
  </div>;
}
