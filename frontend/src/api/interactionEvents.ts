import { getApiBaseUrl } from "./config";

export type InteractionEvent = {
  id: string;
  type:
    | "identity_appeared"
    | "identity_disappeared"
    | "unknown_face_detected"
    | "multiple_faces_detected"
    | "raise_hand"
    | "thumbs_up"
    | "wave";
  username: string;
  gesture: string;
  label: string;
  created_at: string;
};

export type RecentInteractionEventsResponse = {
  events: InteractionEvent[];
};

export async function fetchRecentInteractionEvents() {
  const response = await fetch(`${getApiBaseUrl()}/api/interaction-events/recent`);
  if (!response.ok) {
    throw new Error("Unable to load AI events.");
  }

  return (await response.json()) as RecentInteractionEventsResponse;
}
