import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAnalytics as Analytics } from "../shared/analytics";
import { AdminAnalytics } from "../src/components/admin-analytics";
import { TrafficTracker } from "../src/components/traffic-tracker";
import { api, ApiError } from "../src/lib/api";

vi.mock("../src/lib/api", async (original) => ({ ...await original<typeof import("../src/lib/api")>(), api: { adminAnalytics: vi.fn() } }));

const clients: QueryClient[] = [];
let data: Analytics;

beforeEach(() => {
  data = {
    days: 7, startedAt: Date.parse("2026-09-01"), generatedAt: Date.parse("2026-10-15"),
    current: { visitors: 3, pageViews: 8, returningVisitors: 1, daily: [{ date: "2026-10-14", visitors: 1, pageViews: 3 }, { date: "2026-10-15", visitors: 3, pageViews: 5 }], pages: [{ name: "/tools", views: 5 }], sources: [{ name: "github.com", views: 6 }] },
    previous: { visitors: 2, pageViews: 4, returningVisitors: 0, daily: [], pages: [], sources: [] },
    growth: { members: 2, previousMembers: 1, toolSubmissions: 1, previousToolSubmissions: 0, pendingTools: 2 },
  };
  vi.mocked(api.adminAnalytics).mockReset().mockResolvedValue(data);
});

afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const onUnauthorized = vi.fn();
  const onReviewTools = vi.fn();
  render(<QueryClientProvider client={client}><AdminAnalytics onUnauthorized={onUnauthorized} onReviewTools={onReviewTools} /></QueryClientProvider>);
  return { onUnauthorized, onReviewTools };
}

describe("Admin analytics", () => {
  it("shows useful totals, a chart with exact accessible values and working period and review controls", async () => {
    const { onReviewTools } = renderOverview();
    const user = userEvent.setup();
    await screen.findByRole("img", { name: /Daily unique visitors/ });
    const metric = screen.getByText("Unique visitors").parentElement!;
    expect(within(metric).getByText("3")).toBeTruthy();
    expect(within(metric).getByText("+50% vs previous period")).toBeTruthy();
    expect(screen.getByText("github.com")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Peak 3");
    await user.click(screen.getByText("View daily data"));
    expect(screen.getByRole("table", { name: "Daily traffic in UTC" })).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    await user.click(screen.getByRole("combobox", { name: "Chart metric" }));
    await user.click(screen.getByRole("option", { name: "Page views" }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Peak 5");
    await user.click(screen.getByRole("combobox", { name: "Analytics period" }));
    await user.click(screen.getByRole("option", { name: "Last 7 days" }));
    await waitFor(() => expect(api.adminAnalytics).toHaveBeenLastCalledWith(7, expect.any(AbortSignal)));
    await user.click(screen.getByRole("button", { name: "Review tools" }));
    expect(onReviewTools).toHaveBeenCalledOnce();
  });

  it("shows honest empty data and supports recovery from request errors", async () => {
    vi.mocked(api.adminAnalytics).mockRejectedValueOnce(new Error("Connection interrupted"));
    data.startedAt = null;
    data.previous = null;
    data.current = { visitors: 0, pageViews: 0, returningVisitors: 0, daily: [{ date: "2026-10-15", visitors: 0, pageViews: 0 }], pages: [], sources: [] };
    vi.mocked(api.adminAnalytics).mockResolvedValue(data);
    renderOverview();
    await screen.findByText("Analytics couldn't load. Try again.");
    await userEvent.click(screen.getByRole("button", { name: "Retry analytics" }));
    await screen.findByText("No traffic recorded in this period.");
    expect(screen.getAllByText("Building comparison history")).toHaveLength(2);
    expect(screen.getByText("Waiting for visits")).toBeTruthy();
    expect(screen.getByText(/Traffic starts with the first public visit/)).toBeTruthy();
  });

  it("expires admin access when the analytics request loses authorization", async () => {
    vi.mocked(api.adminAnalytics).mockRejectedValue(new ApiError(401, "unauthorized", "Sign in again."));
    const { onUnauthorized } = renderOverview();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    expect(screen.queryByText("Unique visitors")).toBeNull();
  });

  it("distinguishes small changes from identical totals", async () => {
    data.current.visitors = 1001;
    data.current.pageViews = 999;
    data.previous!.visitors = 1000;
    data.previous!.pageViews = 1000;
    renderOverview();
    expect(await screen.findByText("Less than 1% higher than previous period")).toBeTruthy();
    expect(screen.getByText("Less than 1% lower than previous period")).toBeTruthy();
  });
});

describe("Public visit tracking", () => {
  it("records once under StrictMode, tracks navigation, strips referral details and skips admin", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://github.com/private?email=private@example.com");
    render(<StrictMode><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TrafficTracker /><Link to="/tools">Tools</Link><Link to="/admin">Admin</Link></MemoryRouter></StrictMode>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ page: "/", referrer: "https://github.com" });
    await userEvent.click(screen.getByRole("link", { name: "Tools" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("link", { name: "Admin" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not record browsers requesting privacy and keeps navigation working if tracking fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetcher);
    let doNotTrack = "1";
    vi.stubGlobal("navigator", Object.create(navigator, { doNotTrack: { get: () => doNotTrack } }));
    const view = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TrafficTracker /></MemoryRouter>);
    expect(fetcher).not.toHaveBeenCalled();
    view.unmount();
    doNotTrack = "0";
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TrafficTracker /><Link to="/tools">Tools</Link></MemoryRouter>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("link", { name: "Tools" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
