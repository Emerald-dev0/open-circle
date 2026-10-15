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
  return <div className="relative w-32 shrink-0">
    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-t3"><Icon className="size-4" aria-hidden="true" /></span>
    <SharedSelect aria-label="Appearance" className="pl-10 pr-3" value={theme} onValueChange={(value) => setTheme(parseTheme(value))} options={options} />
  </div>;
}
