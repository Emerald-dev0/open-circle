import type { MemberCommunityState, ParticipationAction } from "@shared/coordination";
import { PaginatedList } from "@/components/pagination";
import { MetalButton } from "@/components/metal-button";
import { Panel, PanelHeader } from "@/components/panel";

export function CommunityGuide() {
  return <section id="start" className="scroll-mt-24">
    <Panel header={<PanelHeader title="Start here" />}>
      <ol className="list-decimal space-y-3 py-4 pl-5 text-sm leading-relaxed text-t2">
        <li><a href="/" className="underline underline-offset-4">Join the developer board</a> using Rank me and your WhatsApp group number.</li>
        <li>Sign in below and connect that WhatsApp account through a private message to the bot.</li>
        <li>Try a member’s project and offer useful feedback, or ask a clear question. Read the catch-up archive for decisions and resources.</li>
      </ol>
      <p className="pb-4 text-xs text-t3">Read the group description for the rules. You can ask the bot for /start, /catchup or /sessions in a private chat.</p>
    </Panel>
  </section>;
}

export function CommunityRoutine({ data, busy, submit }: { data: MemberCommunityState; busy: boolean; submit: (input: ParticipationAction) => Promise<boolean> }) {
  const date = new Intl.DateTimeFormat("en", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });
  return <>
    <section id="catch-up" className="scroll-mt-24">
      <Panel header={<PanelHeader title="Catch up" />}>
        {data.groupSchedule && <p className="py-3 text-sm text-t3">Group quiet hours: {data.quietStart}:00 to {data.quietEnd}:00 ({data.timezone}). You can use this page at any time.</p>}
        {data.sessions.length > 0 && <div className="border-b border-foreground/[0.06] py-4">
          <h2 className="mb-3 text-sm font-medium">Upcoming sessions</h2>
          <PaginatedList items={data.sessions} label="Upcoming sessions" pageSize={5} className="space-y-3">{(session) => <li key={session.id} className="text-sm"><p>{session.title}</p><p className="text-xs text-t3"><time dateTime={new Date(session.startsAt).toISOString()}>{date.format(session.startsAt)}</time> ({data.timezone}) · {Math.round((session.endsAt - session.startsAt) / 60_000)} minutes</p></li>}</PaginatedList>
        </div>}
        {data.updates.length ? <PaginatedList items={data.updates} label="Catch-up updates" pageSize={5} ordered className="divide-y divide-foreground/[0.06]">{(update) => <li key={update.id} className="space-y-2 py-4">
          <h2 className="break-words text-sm font-medium">{update.title}</h2>
          <time className="block text-xs text-t3" dateTime={new Date(update.createdAt).toISOString()}>{date.format(update.createdAt)}</time>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-t2">{update.text}</p>
        </li>}</PaginatedList> : <p className="py-5 text-sm text-t3">No catch-up updates have been published yet. Projects and open questions are below.</p>}
      </Panel>
    </section>
    <Panel header={<PanelHeader title="Volunteer to help" subtitle="Choose your skills and a weekly limit. You can pause or decline requests." />}>
      <form key={JSON.stringify(data.mentor)} className="space-y-4 py-4" onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        await submit({ action: "mentor", available: values.get("available") === "on", skills: String(values.get("skills") ?? "").split(",").map((skill) => skill.trim()).filter(Boolean), weeklyLimit: Number(values.get("weeklyLimit")) });
      }}>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="available" defaultChecked={data.mentor.available} disabled={busy} className="size-4 accent-foreground" />Available for help requests</label>
        <label className="block space-y-1.5 text-sm"><span>Your mentoring skills, separated by commas</span><input className="field h-11 text-sm" name="skills" defaultValue={data.mentor.skills.join(", ")} maxLength={240} placeholder="react, typescript, design" disabled={busy} /><span className="block text-xs text-t3">Up to eight skills. Add the same skill names to questions you want help with.</span></label>
        <label className="block space-y-1.5 text-sm"><span>Maximum requests per week</span><input className="field h-11 text-sm" name="weeklyLimit" type="number" min={1} max={5} required defaultValue={data.mentor.weeklyLimit} disabled={busy} /></label>
        <MetalButton type="submit" loading={busy} className="h-11 w-full" innerClassName="px-5">Save mentor preferences</MetalButton>
      </form>
    </Panel>
  </>;
}
