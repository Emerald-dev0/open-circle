import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import type { MetalText as MetalTextEffect } from "metal-fx";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import postcss, { type Root } from "postcss";
import tailwindcss from "tailwindcss";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MetalText } from "../src/components/metal-text";
import { Dock } from "../src/components/dock";

const effect = vi.hoisted(() => ({ supported: true, painted: false }));

vi.mock("metal-fx", () => ({
  MetalText: ({ children, font, color, theme, className }: ComponentProps<typeof MetalTextEffect>) => (
    <div
      className={effect.supported ? "metal-fx-root" : "metal-fx-fallback"}
      data-theme={theme}
      style={effect.supported ? { opacity: effect.painted ? 1 : 0, visibility: effect.painted ? "visible" : "hidden" } : { display: "inline-flex" }}
    >
      {effect.supported && <canvas aria-hidden="true" />}
      <span className={className} style={{ font, color }}>{children}</span>
    </div>
  ),
}));

let css: Root;

beforeAll(async () => {
  const source = readFileSync("src/components/metal-text.tsx", "utf8");
  css = (await postcss([tailwindcss({ content: [{ raw: source, extension: "tsx" }], corePlugins: { preflight: false } })])
    .process("@tailwind utilities;", { from: undefined })).root;
});

beforeEach(() => {
  effect.supported = true;
  effect.painted = false;
});

function visibleDespiteUnpaintedEffect(root: HTMLElement) {
  expect(root.style.opacity).toBe("0");
  expect(root.style.visibility).toBe("hidden");
  const overrides: Record<string, string> = {};
  css.walkRules((rule) => {
    if (!rule.selectors.some((selector) => root.matches(selector))) return;
    rule.walkDecls((declaration) => {
      if (declaration.important) overrides[declaration.prop] = declaration.value;
    });
  });
  expect(overrides.opacity).toBe("1");
  expect(overrides.visibility).toBe("visible");
}

describe("metal text visibility", () => {
  it("keeps the dock name readable and clickable even if the graphics effect never paints", async () => {
    const onRank = vi.fn();
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dock onRank={onRank} /></MemoryRouter>);
    const name = screen.getByRole("button", { name: "OpenCircle, back to top" });
    expect(name.textContent).toBe("OpenCircle");
    visibleDespiteUnpaintedEffect(name.querySelector<HTMLElement>(".metal-fx-root")!);
    await userEvent.click(name);
    expect(onRank).toHaveBeenCalledOnce();
  });

  it("preserves text, typography and theme through effect readiness and appearance changes", () => {
    const font = "650 15px/1 Aspekta, sans-serif";
    const { rerender } = render(<MetalText font={font} color="#F4F7FB" theme="dark">OpenCircle</MetalText>);
    visibleDespiteUnpaintedEffect(screen.getByText("OpenCircle").parentElement!);
    effect.painted = true;
    rerender(<MetalText font={font} color="#252E3D" theme="light">OpenCircle</MetalText>);
    const name = screen.getByText("OpenCircle");
    expect(name.parentElement?.dataset.theme).toBe("light");
    expect(name.style.fontWeight).toBe("650");
    expect(name.style.fontSize).toBe("15px");
    expect(name.style.lineHeight).toBe("1");
    expect(name.style.fontFamily).toBe("Aspekta, sans-serif");
    expect(name.style.color).toBe("rgb(37, 46, 61)");
    expect(name.parentElement?.style.opacity).toBe("1");
    expect(name.parentElement?.style.visibility).toBe("visible");
  });

  it("keeps the plain-text fallback when WebGL is unavailable", () => {
    effect.supported = false;
    render(<MetalText font="500 12px/1 Aspekta, sans-serif" color="#E2E2E2">Open Source Circle</MetalText>);
    const name = screen.getByText("Open Source Circle");
    expect(name.parentElement?.className).toBe("metal-fx-fallback");
    expect(name.parentElement?.style.visibility).not.toBe("hidden");
    expect(name.parentElement?.querySelector("canvas")).toBeNull();
  });
});
