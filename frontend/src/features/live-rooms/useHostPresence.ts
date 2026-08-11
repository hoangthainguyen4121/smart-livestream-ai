import { useEffect, useRef } from "react";

import { sendHostHeartbeat } from "../../api/liveSessions";
import { getHostResumeToken } from "./hostResumeToken";

/** Matches backend presence stale window comfortably (< grace). */
const HEARTBEAT_MS = 20_000;

type UseHostPresenceOptions = {
  roomId: string;
  sessionId: string | null;
  enabled: boolean;
  mediaLive: boolean;
};

/** Keep host lease alive via heartbeat (no frame upload). */
export function useHostPresence({
  roomId,
  sessionId,
  enabled,
  mediaLive,
}: UseHostPresenceOptions): void {
  const mediaLiveRef = useRef(mediaLive);
  mediaLiveRef.current = mediaLive;

  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }
    const token = getHostResumeToken(roomId);
    if (!token) {
      return;
    }

    let cancelled = false;

    const beat = async () => {
      if (cancelled) {
        return;
      }
      try {
        await sendHostHeartbeat(sessionId, {
          host_token: token,
          media_live: mediaLiveRef.current,
        });
      } catch {
        // Lease may have expired; DemoPage reclaim / room load handles UX.
      }
    };

    void beat();
    const heartbeatTimer = window.setInterval(() => {
      void beat();
    }, HEARTBEAT_MS);

    const onPageHide = () => {
      void beat();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, mediaLive, roomId, sessionId]);
}
