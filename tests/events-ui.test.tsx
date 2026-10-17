import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminEvents from "../src/components/events/admin-events";
import { EventDetails } from "../src/components/events/event-details";
import { AssetUpload } from "../src/components/events/asset-upload";
import { eventsApi } from "../src/lib/events-api";
import * as uploadClient from "../src/lib/events-api";
import { useGitHubSignOut } from "../src/hooks/use-community";
import { api as generalApi } from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { emptyEvent, EVENT_PART_BYTES, type EventView } from "../shared/events";
function event(): EventView { return { id:"8ab19b80-e64c-4d32-b6ce-fb4d090b9bfb",slug:"typescript-session",content:{ ...emptyEvent(),title:"Learn TypeScript",summary:"Build together",description:"A beginner learning session.",host:"Alice",startsAt:Date.now()+3600000,endsAt:Date.now()+7200000,platform:"Google Meet",joinUrl:"https://meet.google.com/abc" },published:false,version:1,cover:null,recording:null,files:[],createdAt:Date.now(),updatedAt:Date.now() }; }
function wrapper(children: React.ReactNode) { const q = new QueryClient({ defaultOptions:{ queries:{ retry:false },mutations:{ retry:false } } }); return render(<MemoryRouter><QueryClientProvider client={q}>{children}</QueryClientProvider></MemoryRouter>); }
beforeEach(() => { Object.defineProperty(URL,"createObjectURL",{ configurable:true,value:vi.fn(() => "blob:preview") }); Object.defineProperty(URL,"revokeObjectURL",{ configurable:true,value:vi.fn() }); });
afterEach(() => { vi.restoreAllMocks(); });
it("creates a draft, publishes it and retains resource edits after a rejected save", async () => {
  const user = userEvent.setup(); const saved = event();
  vi.spyOn(eventsApi,"list").mockResolvedValue({ events:[],storageConfigured:true });
  const save = vi.spyOn(eventsApi,"save").mockImplementation(async (id,version,content,action) => ({ ...saved,id,version:version+1,content,published:action === "publish" }));
  wrapper(<AdminEvents onUnauthorized={vi.fn()} />);
  await user.click(await screen.findByRole("button",{ name:"Create event" }));
  await user.type(screen.getByLabelText("Title"),"Learn TypeScript");
  await user.click(screen.getByRole("button",{ name:"Save draft" }));
  await screen.findByText("Event saved."); expect(save.mock.calls[0][3]).toBe("save");
  expect(screen.getByRole("button",{ name:"Preview member page" })).toBeTruthy();
  await user.click(screen.getByRole("button",{ name:"Publish event" })); await screen.findByText("Event published."); expect(save.mock.calls[1][3]).toBe("publish");
  await user.click(screen.getByRole("button",{ name:"Add resource link" })); await user.type(screen.getByLabelText("Resource title"),"Exercises"); await user.type(screen.getByLabelText("HTTPS resource link"),"https://github.com/opencirclehq/open-circle");
  save.mockRejectedValueOnce(new Error("Save failed. Try again.")); await user.click(screen.getByRole("button",{ name:"Save resource changes" })); await screen.findByRole("alert"); expect((screen.getByLabelText("Resource title") as HTMLInputElement).value).toBe("Exercises");
});
it("shows honest no-recording, missing-link, cancellation and resource states", () => {
  const e = event(); e.content.joinUrl = "";
  const view = wrapper(<EventDetails event={e} />);
  expect(screen.getByText("Recording not available yet.")).toBeTruthy(); expect(screen.getByText("The joining link has not been added yet.")).toBeTruthy(); expect(screen.queryByRole("link",{ name:"Join event" })).toBeNull();
  e.content.cancelled = true; e.content.joinUrl = "https://meet.google.com/abc";
  view.rerender(<EventDetails event={e} />); expect(screen.getByText("This event has been cancelled.")).toBeTruthy(); expect(screen.queryByRole("link",{ name:"Join event" })).toBeNull();
});
it("offers canonical sharing for published events and hides it for private previews", () => {
  const e = event();
  const view = wrapper(<EventDetails event={e} admin />);
  expect(screen.queryByRole("button", { name: `Share event: ${e.content.title}` })).toBeNull();
  view.rerender(<EventDetails event={{ ...e, published: true }} admin />);
  expect(screen.getByRole("button", { name: `Share event: ${e.content.title}` })).toBeTruthy();
});
it("retries a failed part without repeating completed parts and only reports a verified attachment", async () => {
  const user = userEvent.setup(); const saved = vi.fn(); const active = vi.fn(); let attempts = 0;
  const api = vi.spyOn(eventsApi,"upload").mockImplementation(async <T,>(body: Record<string,unknown>) => {
    const result = body.action === "initiate" ? { id:body.uploadId,state:"uploading" } : body.action === "part" ? { url:`https://storage.test/${body.part}` } : event(); return result as T;
  });
  const put = vi.spyOn(uploadClient,"uploadPart").mockImplementation(async (url,_blob,progress) => { attempts++; if (url.endsWith("/2") && attempts === 2) throw Error("Disconnected. Retry."); progress(EVENT_PART_BYTES); });
  wrapper(<AssetUpload kind="recording" eventId="event" disabled={false} onSaved={saved} onActive={active} />);
  const file = new File([new Uint8Array(EVENT_PART_BYTES+32)],"recording.mp4",{ type:"video/mp4" });
  await user.upload(screen.getByLabelText("Choose recording"),file); await user.click(screen.getByRole("button",{ name:"Upload file" })); await screen.findByText("Disconnected. Retry."); expect(saved).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{ name:"Retry upload" })); await screen.findByText("Upload verified and attached."); expect(put.mock.calls.map(c => c[0])).toEqual(["https://storage.test/1","https://storage.test/2","https://storage.test/2"]); expect(api.mock.calls.filter(c => c[0].action === "complete")).toHaveLength(1); expect(saved).toHaveBeenCalledOnce();
});
it("recovers from failed initiation and cancellation of a file never created on storage", async () => {
  const user = userEvent.setup(); const active = vi.fn();
  vi.spyOn(eventsApi,"upload").mockRejectedValue(new ApiError(404,"upload_missing","This upload does not exist."));
  wrapper(<AssetUpload kind="cover" eventId="event" disabled={false} onSaved={vi.fn()} onActive={active} />);
  await user.upload(screen.getByLabelText("Choose cover"),new File(["png"],"cover.png",{ type:"image/png" }));
  expect((screen.getByAltText("Selected cover preview") as HTMLImageElement).src).toBe("blob:preview");
  await user.click(screen.getByRole("button",{ name:"Upload file" })); await screen.findByRole("alert"); await user.click(screen.getByRole("button",{ name:"Cancel upload" }));
  await waitFor(() => expect((screen.getByLabelText("Choose cover") as HTMLInputElement).disabled).toBe(false)); expect(active).toHaveBeenLastCalledWith(false);
});
it("freezes editor fields while an upload is pending so completion cannot overwrite edits", async () => {
  const user = userEvent.setup(); vi.spyOn(eventsApi,"list").mockResolvedValue({ events:[event()],storageConfigured:true });
  vi.spyOn(eventsApi,"upload").mockImplementation(() => new Promise(() => {}));
  wrapper(<AdminEvents onUnauthorized={vi.fn()} />); await user.click(await screen.findByRole("button",{ name:"Manage event" }));
  await user.upload(screen.getByLabelText("Choose resource file"),new File(["pdf"],"notes.pdf",{ type:"application/pdf" }));
  await user.upload(screen.getByLabelText("Choose cover"),new File(["png"],"cover.png",{ type:"image/png" }));
  await user.click(screen.getAllByRole("button",{ name:"Upload file" })[0]);
  await user.click(screen.getAllByRole("button",{ name:"Cancel upload" })[1]);
  await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).closest("fieldset")?.disabled).toBe(true));
  expect((screen.getByRole("button",{ name:"Add resource link" }) as HTMLButtonElement).closest("fieldset")?.disabled).toBe(true);
});
it("uses an accessible native player and same-origin protected media paths", () => {
  const e = event(); e.recording = { id:"video",kind:"recording",contentType:"video/mp4",size:12345,title:"Session recording",filename:"session.mp4",duration:null,uploadedAt:Date.now() };
  const view = wrapper(<EventDetails event={e} />); const video = view.container.querySelector("video")!; expect(video.controls).toBe(true); expect(video.getAttribute("aria-label")).toBe("Session recording"); expect(video.getAttribute("src")).toContain("/api/event-media?");
  fireEvent.error(video); expect(screen.getByRole("button",{ name:"Retry playback" })).toBeTruthy();
});

it("cancels and clears private event queries after GitHub sign-out", async () => {
  vi.spyOn(generalApi,"signOut").mockResolvedValue({ ok:true });
  const q = new QueryClient(); const key = ["events",42,false,"list"];
  q.setQueryData(key,{ events:[event()] }); q.setQueryData(["community"],{ profile:{ id:42 },toolVotes:{} });
  const hook = renderHook(() => useGitHubSignOut(),{ wrapper:({ children }) => <QueryClientProvider client={q}>{children}</QueryClientProvider> });
  await act(() => hook.result.current.mutateAsync());
  expect(q.getQueryData(key)).toBeUndefined(); expect(q.getQueryData<{ profile:unknown }>(["community"])?.profile).toBeNull();
});
