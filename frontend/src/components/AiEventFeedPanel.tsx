import { useEffect, useState } from "react";

import {
  fetchRecentInteractionEvents,
  type InteractionEvent,
} from "../api/interactionEvents";


const EVENT_REFRESH_INTERVAL_MS = 1500;


type CompressedInteractionEvent = InteractionEvent & {
  count: number;
};


export function AiEventFeedPanel() {
  const [events, setEvents] = useState<InteractionEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const compressedEvents = compressConsecutiveDuplicateEvents(events);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetchRecentInteractionEvents();
        if (!isMounted) {
          return;
        }

        setEvents(
          response.events.filter((event) => event.type !== "unknown_face_detected"),
        );
        setErrorMessage(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unable to load AI events.");
      }
    }

    loadEvents();
    const timer = window.setInterval(loadEvents, EVENT_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="aiEventFeedPanel">
      <div className="cardHeader">
        <h2>AI Event Feed</h2>
        <span className="status">Events</span>
      </div>
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <div className="aiEventList">
        {compressedEvents.length > 0 ? (
          compressedEvents.map((event) => (
            <div className="aiEventItem" key={event.id}>
              <time>{formatEventTime(event.created_at)}</time>
              <strong>{formatEventType(event.type)}</strong>
              <span>
                {event.label}
                {event.count > 1 ? (
                  <span className="aiEventCountBadge">x{event.count}</span>
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <p className="emptyState">Start Backend Annotated Stream to see AI events.</p>
        )}
      </div>
    </section>
  );
}


function compressConsecutiveDuplicateEvents(events: InteractionEvent[]) {
  const compressedEvents: CompressedInteractionEvent[] = [];

  for (const event of events) {
    const previousEvent = compressedEvents[compressedEvents.length - 1];
    if (previousEvent && isSameDisplayEvent(previousEvent, event)) {
      previousEvent.count += 1;
      previousEvent.id = event.id;
      previousEvent.created_at = event.created_at;
      continue;
    }

    compressedEvents.push({
      ...event,
      count: 1,
    });
  }

  return compressedEvents;
}


function isSameDisplayEvent(first: InteractionEvent, second: InteractionEvent) {
  return (
    first.type === second.type
    && first.username === second.username
    && first.label === second.label
  );
}


function formatEventType(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}


function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
