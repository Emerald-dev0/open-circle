import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "../src/components/board/how-it-works";

it("explains confirmed help, limits, voluntary stars and delayed scores in a scrollable dialog", () => {
  render(<HowItWorks open onOpenChange={() => {}} helpersDelayed />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("overflow-y-auto");
  expect(screen.getByText("Confirmed useful contribution")).toBeTruthy();
  expect(screen.getByText("20 pts")).toBeTruthy();
  expect(screen.getByText("+5 pts")).toBeTruthy();
  expect(screen.getByText(/Help counts for 28 days/)).toBeTruthy();
  expect(screen.getByText(/Giving stars is voluntary and earns no helper points/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Previously confirmed points stay visible");
});
