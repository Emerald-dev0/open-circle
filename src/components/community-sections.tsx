import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
export function CommunitySections({ section, children, disabled = false, onChange }: { section: "discussions" | "questions" | "events"; children: ReactNode; disabled?: boolean; onChange?: () => void }) {
  const navigate = useNavigate();
  return <Tabs value={section} onValueChange={value => { onChange?.(); navigate(value === "events" ? "/events" : `/community?tab=${value}`); }}>
    <TabsList aria-label="Community sections" className="h-auto flex-wrap"><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="discussions">Discussions</TabsTrigger><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="questions">Questions</TabsTrigger><TabsTrigger className="min-h-11 focus-visible:ring-2 focus-visible:ring-foreground/40" disabled={disabled} value="events">Events</TabsTrigger></TabsList>
    <TabsContent value={section}>{children}</TabsContent>
  </Tabs>;
}
