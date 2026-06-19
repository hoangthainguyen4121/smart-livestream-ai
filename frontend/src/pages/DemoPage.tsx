import { useEffect, useState } from "react";

import { type ChatMessage } from "../api/chat";
import { AiEventFeedPanel } from "../components/AiEventFeedPanel";
import { ChatPanel } from "../components/ChatPanel";


const BACKEND_VIDEO_FEED_URL = "http://127.0.0.1:8000/video-feed";
const HOST_USERNAME = "hoang";
const DEMO_ROOM_ID = "demo";
const MOCK_VIEWER_COUNT = 128;
const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "demo-initial-1",
    room_id: DEMO_ROOM_ID,
    author: "Minh",
    text: "Hello!",
    created_at: "",
  },
  {
    id: "demo-initial-2",
    room_id: DEMO_ROOM_ID,
    author: "An",
    text: "Nice stream!",
    created_at: "",
  },
  {
    id: "demo-initial-3",
    room_id: DEMO_ROOM_ID,
    author: "Khoa",
    text: "Raise your hand!",
    created_at: "",
  },
];

export function DemoPage() {
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [streamDurationSeconds, setStreamDurationSeconds] = useState(0);

  useEffect(() => {
    if (!isStreamLive) {
      return;
    }

    const timer = window.setInterval(() => {
      setStreamDurationSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isStreamLive]);

  function handleRegisterFaceClick(event: { preventDefault: () => void }) {
    event.preventDefault();
    setIsStreamLive(false);
    window.setTimeout(() => {
      window.location.href = "/register-face";
    }, 500);
  }

  return (
    <main className="page">
      <section className="livestreamShell">
        <div className="streamMain">
          <header className="streamHeader">
            <div>
              <p className="eyebrow">Smart Livestream AI MVP</p>
              <h1>AI Livestream Demo</h1>
              <p className="streamMeta">
                Hosted by <strong>@{HOST_USERNAME}</strong>
              </p>
            </div>
            <div className="streamStats">
              <span className={isStreamLive ? "liveBadge" : "offlineBadge"}>
                {isStreamLive ? "LIVE" : "OFFLINE"}
              </span>
              <span>{MOCK_VIEWER_COUNT} viewers</span>
              <span>{formatDuration(streamDurationSeconds)}</span>
            </div>
          </header>

          <section className="modeToggle" aria-label="Stream actions">
            <a className="modeLink" href="/register-face" onClick={handleRegisterFaceClick}>
              Register Face
            </a>
          </section>

          <div className="videoCard">
            <div className="cardHeader">
              <h2>Main Stream</h2>
            </div>

            {isStreamLive ? (
              <img
                src={BACKEND_VIDEO_FEED_URL}
                alt="Backend annotated video stream"
                className="video streamImage"
              />
            ) : (
              <div className="streamPlaceholder">
                Stream stopped. Click Start Stream.
              </div>
            )}

            <div className="metricsRow">
              <span>Backend owns webcam capture</span>
              <span>Annotated MJPEG stream</span>
            </div>
          </div>

          <section className="controlBar">
            <button type="button" onClick={() => setIsStreamLive(true)}>
              Start Stream
            </button>
            <button type="button" onClick={() => setIsStreamLive(false)}>
              Stop Stream
            </button>
          </section>

          <AiEventFeedPanel />
        </div>

        <ChatPanel
          roomId={DEMO_ROOM_ID}
          author={HOST_USERNAME}
          initialMessages={INITIAL_CHAT_MESSAGES}
        />
      </section>
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
