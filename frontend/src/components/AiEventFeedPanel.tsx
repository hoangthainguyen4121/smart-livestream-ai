import { useEffect, useState } from "react";

import {
  fetchRecentInteractionEvents,
  type InteractionEvent,
} from "../api/interactionEvents";


const EVENT_REFRESH_INTERVAL_MS = 1500;


export function AiEventFeedPanel() {
  const [events, setEvents] = useState<InteractionEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetchRecentInteractionEvents();
        if (!isMounted) {
          return;
        }

        setEvents(response.events);
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
        <span className="status">Gestures</span>
      </div>
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <div className="aiEventList">
        {events.length > 0 ? (
          events.map((event) => (
            <div className="aiEventItem" key={event.id}>
              <time>{formatEventTime(event.created_at)}</time>
              <strong>{event.gesture}</strong>
              <span>{event.label}</span>
            </div>
          ))
        ) : (
          <p className="emptyState">Raise a hand or wave in Backend Annotated Stream.</p>
        )}
      </div>
    </section>
  );
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
