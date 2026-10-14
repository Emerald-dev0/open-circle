import type { ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";

let storageDocument: JSDOM;

vi.mock("metal-fx", () => ({
  MetalFx: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  MetalText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  MetalBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
  storageDocument.window.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
