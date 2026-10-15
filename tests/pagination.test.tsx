import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { PaginatedList } from "../src/components/pagination";

const items = Array.from({ length: 97 }, (_, index) => ({ id: index, name: `Item ${index + 1}` }));
function list(values = items, resetKey = "", disabled = false) {
  return <PaginatedList items={values} label="Results" pageSize={10} resetKey={resetKey} disabled={disabled}>{(item) => <li key={item.id}><button>{item.name}</button></li>}</PaginatedList>;
}

it("provides bounded page navigation, range announcements and a current page", async () => {
  render(list());
  const user = userEvent.setup();
  const nav = () => within(screen.getByRole("navigation", { name: "Results pagination" }));
  const rows = () => within(screen.getByRole("list", { name: "Results" })).getAllByRole("listitem");
  expect(rows()).toHaveLength(10);
  expect(nav().getByRole("status").textContent).toBe("1–10 of 97");
  expect((nav().getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
  expect(nav().getAllByRole("button").length).toBeLessThanOrEqual(7);
  await user.click(nav().getByRole("button", { name: "Go to page 10" }));
  expect(rows()).toHaveLength(7);
  expect(rows()[0].textContent).toBe("Item 91");
  expect(nav().getByRole("status").textContent).toBe("91–97 of 97");
  expect(nav().getByRole("button", { name: "Go to page 10" }).getAttribute("aria-current")).toBe("page");
  expect((nav().getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(nav().getByRole("button", { name: "Previous" }));
  expect(rows()[0].textContent).toBe("Item 81");
  expect(document.activeElement?.contains(screen.getByRole("list", { name: "Results" }))).toBe(true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it("resets when filters change and clamps shrinking results without bringing back an old page", async () => {
  const view = render(list());
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Go to page 10" }));
  view.rerender(list(items.slice(0, 21)));
  expect(screen.getByText("Item 21")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("21–21 of 21");
  view.rerender(list());
  expect(screen.getByRole("status").textContent).toBe("21–30 of 97");
  view.rerender(list(items, "new filters"));
  expect(screen.getByRole("status").textContent).toBe("1–10 of 97");
  view.rerender(list([], "new filters"));
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByRole("listitem")).toBeNull();
  view.rerender(list(items.slice(0, 10)));
  expect(screen.queryByRole("navigation")).toBeNull();
});

it("disables pagination while a mutation is pending and retains working item actions", async () => {
  const view = render(list(items, "", true));
  for (const button of within(screen.getByRole("navigation")).getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Item 1" }) as HTMLButtonElement).disabled).toBe(false);
  view.rerender(list(items, "", false));
  await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("status").textContent).toBe("11–20 of 97");
});

it("keeps multiple lists independent", async () => {
  const values = items.slice(0, 15);
  render(<><PaginatedList items={values} label="First" pageSize={10}>{(item) => <li key={item.id}>{item.name}</li>}</PaginatedList><PaginatedList items={values} label="Second" pageSize={10}>{(item) => <li key={item.id}>{item.name}</li>}</PaginatedList></>);
  await userEvent.setup().click(within(screen.getByRole("navigation", { name: "First pagination" })).getByRole("button", { name: "Next" }));
  expect(within(screen.getByRole("list", { name: "First" })).getAllByRole("listitem")).toHaveLength(5);
  expect(within(screen.getByRole("list", { name: "Second" })).getAllByRole("listitem")).toHaveLength(10);
});
