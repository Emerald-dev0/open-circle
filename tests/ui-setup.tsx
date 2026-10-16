import type { ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { MotionGlobalConfig } from "motion/react";

// Animations finish instantly in tests, so exiting rows and closing forms
// leave the DOM right away, as they do once a real animation completes.
MotionGlobalConfig.skipAnimations = true;

let storageDocument: JSDOM;

vi.mock("metal-fx", () => ({
  MetalFx: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  MetalText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  MetalBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// The app shows errors as toasts, never inline. This stand-in renders error
// toasts into the page as role="alert" so tests can find them; every method
// stays a spy, and confirmations are asserted through the spy only.
vi.mock("sonner", () => {
  const show = (render: boolean) => (message: unknown, options?: { id?: string | number; action?: { label: string; onClick: () => void } }) => {
    if (!render) return options?.id ?? String(message);
    let region = document.getElementById("test-toasts");
    if (!region) {
      region = document.createElement("div");
      region.id = "test-toasts";
      document.body.appendChild(region);
    }
    const id = options?.id === undefined ? undefined : String(options.id);
    if (id) Array.from(region.children).find((el) => (el as HTMLElement).dataset.toastId === id)?.remove();
    const toast = document.createElement("div");
    toast.setAttribute("role", "alert");
    if (id) toast.dataset.toastId = id;
    toast.textContent = String(message);
    if (options?.action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = options.action.label;
      button.addEventListener("click", () => options.action?.onClick());
      region.appendChild(button);
    }
    region.appendChild(toast);
    return id ?? toast.textContent;
  };
  const toast = Object.assign(vi.fn(show(false)), {
    error: vi.fn(show(true)),
    success: vi.fn(show(false)),
    message: vi.fn(show(false)),
    info: vi.fn(show(false)),
    warning: vi.fn(show(false)),
    dismiss: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network requests must be mocked in UI tests")));
  storageDocument = new JSDOM("", { url: "https://opencircle.test" });
  vi.stubGlobal("localStorage", storageDocument.window.localStorage);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  document.getElementById("test-toasts")?.remove();
  storageDocument.window.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
