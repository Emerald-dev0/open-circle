export const participationSections = [
  { value: "overview", label: "Overview" },
  { value: "catch-up", label: "Catch up" },
  { value: "repositories", label: "Repos" },
  { value: "projects", label: "Projects" },
  { value: "help", label: "Help" },
  { value: "feedback", label: "Feedback" },
] as const;

export type ParticipationSection = typeof participationSections[number]["value"];

export function participationDestination(value: unknown): string | null {
  return typeof value === "string" && (value === "/participation" || value === "/participation#start" || participationSections.some((entry) => value === `/participation#${entry.value}`)) ? value : null;
}
