export type InteractionEvent = {
  id: string;
  type: "gesture";
  username: string;
  gesture: "Raise Hand" | "Wave";
  label: string;
  created_at: string;
};

export type RecentInteractionEventsResponse = {
  events: InteractionEvent[];
};

export async function fetchRecentInteractionEvents() {
  const response = await fetch("http://127.0.0.1:8000/api/interaction-events/recent");
  if (!response.ok) {
    throw new Error("Unable to load AI events.");
  }

  return (await response.json()) as RecentInteractionEventsResponse;
}
