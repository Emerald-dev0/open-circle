import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeSelect } from "@/components/theme-select";
import { useTheme } from "@/hooks/use-theme";
import { THEME_KEY, THEME_QUERY } from "@/lib/theme";

function CurrentTheme() {
  const { theme, resolvedTheme } = useTheme();
  return <><ThemeSelect /><output>{theme}:{resolvedTheme}</output></>;
}

let media: EventTarget & { matches: boolean; media: string };

beforeEach(() => {
  document.documentElement.className = "dark";
  document.head.innerHTML = '<meta name="theme-color" content="#04060A"><meta name="color-scheme" content="dark">';
  media = Object.assign(new EventTarget(), { matches: false, media: THEME_QUERY });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.style.removeProperty("color-scheme");
  document.head.innerHTML = "";
});

async function choose(value: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Appearance" }));
  await user.click(screen.getByRole("option", { name: value }));
}

describe("appearance preference", () => {
  it("follows the device by default and responds to its appearance changes", () => {
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    expect(screen.getByRole("status").textContent).toBe("system:light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    act(() => { media.matches = true; media.dispatchEvent(new Event("change")); });
    expect(screen.getByRole("status").textContent).toBe("system:dark");
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("switches between explicit modes, saves the choice and restores it on return", async () => {
    const view = render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    await choose("Dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#04060A");
    await choose("Light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#F6F7F9");
    view.unmount();
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    expect(screen.getByRole("status").textContent).toBe("light:light");
  });

  it("keeps an explicit preference until System is selected again", async () => {
    localStorage.setItem(THEME_KEY, "dark");
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    act(() => media.dispatchEvent(new Event("change")));
    expect(screen.getByRole("status").textContent).toBe("dark:dark");
    await choose("System");
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
    expect(screen.getByRole("status").textContent).toBe("system:light");
  });

  it("supports changing appearance with the keyboard", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Appearance" }));
    await user.keyboard("{Enter}{Home}{Enter}");
    expect(screen.getByRole("status").textContent).toBe("light:light");
  });

  it("synchronizes changes and storage clearing from another tab", () => {
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    localStorage.setItem(THEME_KEY, "dark");
    fireEvent(window, new StorageEvent("storage", { key: "other-setting" }));
    expect(screen.getByRole("status").textContent).toBe("system:light");
    fireEvent(window, new StorageEvent("storage", { key: THEME_KEY, newValue: "dark" }));
    expect(screen.getByRole("status").textContent).toBe("dark:dark");
    localStorage.clear();
    fireEvent(window, new StorageEvent("storage", { key: null }));
    expect(screen.getByRole("status").textContent).toBe("system:light");
  });

  it("falls back from invalid preferences and works when storage is unavailable", async () => {
    localStorage.setItem(THEME_KEY, "invalid");
    vi.spyOn(Object.getPrototypeOf(localStorage), "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    expect(screen.getByRole("status").textContent).toBe("system:light");
    await choose("Dark");
    expect(screen.getByRole("status").textContent).toBe("dark:dark");
  });

  it("removes device and tab listeners when unmounted", () => {
    const removeMedia = vi.spyOn(media, "removeEventListener");
    const removeStorage = vi.spyOn(window, "removeEventListener");
    const view = render(<ThemeProvider><CurrentTheme /></ThemeProvider>);
    view.unmount();
    expect(removeMedia).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeStorage).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});

describe("appearance before app startup", () => {
  const html = readFileSync("index.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

  it.each([
    ["light", true, "light"], ["dark", false, "dark"],
    ["system", true, "dark"], ["system", false, "light"],
    [null, true, "dark"], [null, false, "light"], ["invalid", false, "light"],
  ])("applies %s with device dark=%s before React mounts", (preference, dark, expected) => {
    if (preference !== null) localStorage.setItem(THEME_KEY, preference);
    media.matches = dark;
    new Function(script)();
    expect(document.documentElement.className).toBe(expected);
    expect(document.documentElement.style.colorScheme).toBe(expected);
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe(expected);
  });

  it("still follows the device when reading storage fails", () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    new Function(script)();
    expect(document.documentElement.className).toBe("light");
  });
});
