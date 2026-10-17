import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareButton } from "../src/components/share-button";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
function sharing(share: unknown, writeText?: unknown) {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: writeText ? { writeText } : undefined });
}
afterEach(() => {
  for (const [key, descriptor] of [["clipboard", originalClipboard], ["share", originalShare]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});
it.each(["discussion", "question", "event"] as const)("copies a canonical %s link when native sharing is unavailable", async (kind) => {
  const copy = vi.fn().mockResolvedValue(undefined);
  sharing(undefined, copy);
  const path = kind === "event" ? "/events/typescript-session" : "/community/27c5a6cf-d9d7-4ea2-a3e6-e737328ea6c9";
  render(<ShareButton path={path} title="A shared community post" kind={kind} />);
  fireEvent.click(screen.getByRole("button", { name: `Share ${kind}: A shared community post` }));
  await screen.findByRole("button", { name: `Link copied for ${kind}: A shared community post` });
  expect(copy).toHaveBeenCalledWith(`${window.location.origin}${path}`);
});
it("opens the device share menu and treats cancellation as a cancelled action", async () => {
  const native = vi.fn().mockResolvedValue(undefined);
  const copy = vi.fn();
  sharing(native, copy);
  render(<ShareButton path="/events/typescript-session" title="Learn TypeScript" kind="event" />);
  const button = screen.getByRole("button", { name: "Share event: Learn TypeScript" });
  fireEvent.click(button);
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(native).toHaveBeenCalledWith({ title: "Learn TypeScript", url: `${window.location.origin}/events/typescript-session` });
  expect(copy).not.toHaveBeenCalled();
  native.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
  fireEvent.click(button);
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(copy).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("falls back to copying if the device share menu fails", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  sharing(vi.fn().mockRejectedValue(new Error("Share unavailable")), copy);
  render(<ShareButton path="/community/post" title="A discussion" kind="discussion" />);
  fireEvent.click(screen.getByRole("button", { name: "Share discussion: A discussion" }));
  await screen.findByText("Copied");
  expect(copy).toHaveBeenCalledWith(`${window.location.origin}/community/post`);
});
it.each([false, true])("offers a selected, readable link when clipboard access is unavailable or denied (%s)", async (denied) => {
  sharing(undefined, denied ? vi.fn().mockRejectedValue(new Error("Denied")) : undefined);
  render(<ShareButton path="/events/typescript-session" title="Learn TypeScript" kind="event" />);
  fireEvent.click(screen.getByRole("button", { name: "Share event: Learn TypeScript" }));
  await screen.findByRole("dialog", { name: "Share link" });
  const field = screen.getByLabelText("Link to share") as HTMLInputElement;
  expect(field.value).toBe(`${window.location.origin}/events/typescript-session`);
  expect(field.readOnly).toBe(true);
  expect(document.activeElement).toBe(field);
  expect(field.selectionEnd).toBe(field.value.length);
  fireEvent.keyDown(field, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share event: Learn TypeScript" }));
});
