import { useEffect, useRef, useState } from "react";

import { type ChatMessage } from "../api/chat";
import { createRealtimeSocket, type RealtimeMessage, type RealtimeResult } from "../api/realtime";
import { ChatPanel } from "../components/ChatPanel";
import { OverlayCanvas } from "../components/OverlayCanvas";


const FRAME_SEND_INTERVAL_MS = 200;
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const FRAME_JPEG_QUALITY = 0.7;
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

type DemoMode = "browser-ws" | "backend-stream";


export function DemoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const awaitingResponseRef = useRef(false);
  const lastSentAtRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [latestResult, setLatestResult] = useState<unknown>(null);
  const [lastResponseTimeMs, setLastResponseTimeMs] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState<DemoMode>("backend-stream");
  const [isStreamLive, setIsStreamLive] = useState(true);
  const [showAiOverlay, setShowAiOverlay] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [streamDurationSeconds, setStreamDurationSeconds] = useState(0);
  const realtimeResult = isRealtimeResult(latestResult) ? latestResult : null;
  const isBrowserMode = demoMode === "browser-ws";

  useEffect(() => {
    if (!isBrowserMode) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraError(null);
      return;
    }

    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Unable to open camera");
      }
    }

    startCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isBrowserMode]);

  useEffect(() => {
    if (!isBrowserMode) {
      awaitingResponseRef.current = false;
      setSocketStatus("disabled");
      return;
    }

    const socket = createRealtimeSocket();
    socketRef.current = socket;

    socket.onopen = () => setSocketStatus("connected");
    socket.onclose = () => {
      awaitingResponseRef.current = false;
      setSocketStatus("disconnected");
    };
    socket.onerror = () => {
      awaitingResponseRef.current = false;
      setSocketStatus("error");
    };
    socket.onmessage = (event) => {
      awaitingResponseRef.current = false;
      if (lastSentAtRef.current !== null) {
        setLastResponseTimeMs(Math.round(performance.now() - lastSentAtRef.current));
      }

      try {
        setLatestResult(JSON.parse(event.data));
      } catch {
        setLatestResult(event.data);
      }
    };

    return () => {
      socket.close();
    };
  }, [isBrowserMode]);

  useEffect(() => {
    if (!isBrowserMode) {
      return;
    }

    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN || !video || !canvas) {
        return;
      }
      if (awaitingResponseRef.current) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const message: RealtimeMessage = {
        type: "frame",
        frame: canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY),
        timestamp: Date.now(),
      };

      awaitingResponseRef.current = true;
      lastSentAtRef.current = performance.now();
      socket.send(JSON.stringify(message));
    }, FRAME_SEND_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isBrowserMode]);

  useEffect(() => {
    if (!isStreamLive) {
      return;
    }

    const timer = window.setInterval(() => {
      setStreamDurationSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isStreamLive]);

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

          <section className="modeToggle" aria-label="Demo mode">
            <button
              className={demoMode === "browser-ws" ? "active" : ""}
              type="button"
              onClick={() => setDemoMode("browser-ws")}
            >
              Browser Camera + WebSocket Debug
            </button>
            <button
              className={demoMode === "backend-stream" ? "active" : ""}
              type="button"
              onClick={() => setDemoMode("backend-stream")}
            >
              Backend Annotated Stream
            </button>
          </section>

          <div className="videoCard">
            <div className="cardHeader">
              <h2>Main Stream</h2>
              <span className={`status ${socketStatus}`}>WS: {socketStatus}</span>
            </div>

            {demoMode === "backend-stream" ? (
              <img
                src={BACKEND_VIDEO_FEED_URL}
                alt="Backend annotated video stream"
                className="video streamImage"
              />
            ) : cameraError ? (
              <div className="error">Camera error: {cameraError}</div>
            ) : (
              <div className="videoFrame">
                <video ref={videoRef} autoPlay playsInline muted className="video" />
                {showAiOverlay ? (
                  <OverlayCanvas
                    faces={realtimeResult?.faces ?? []}
                    sourceWidth={FRAME_WIDTH}
                    sourceHeight={FRAME_HEIGHT}
                    videoRef={videoRef}
                  />
                ) : null}
              </div>
            )}

            {demoMode === "browser-ws" ? (
              <div className="metricsRow">
                <span>Send interval: {FRAME_SEND_INTERVAL_MS} ms</span>
                <span>
                  Last response:{" "}
                  {lastResponseTimeMs === null ? "waiting..." : `${lastResponseTimeMs} ms`}
                </span>
              </div>
            ) : (
              <div className="metricsRow">
                <span>Backend owns webcam capture</span>
                <span>Annotated MJPEG stream</span>
              </div>
            )}
            <canvas ref={canvasRef} className="hiddenCanvas" />
          </div>

          <section className="controlBar">
            <button type="button" onClick={() => setIsStreamLive(true)}>
              Start Stream
            </button>
            <button type="button" onClick={() => setIsStreamLive(false)}>
              Stop Stream
            </button>
            <button type="button" onClick={() => setShowAiOverlay((value) => !value)}>
              {showAiOverlay ? "Hide AI Overlay" : "Show AI Overlay"}
            </button>
            <button type="button" onClick={() => setShowDebugPanel((value) => !value)}>
              {showDebugPanel ? "Hide Debug Panel" : "Show Debug Panel"}
            </button>
          </section>

          {showDebugPanel ? (
            <section className="debugCard">
              <h2>Realtime Debug Result</h2>
              <pre className="debugPanel">
                {latestResult ? JSON.stringify(latestResult, null, 2) : "Waiting for backend response..."}
              </pre>
            </section>
          ) : null}
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


function isRealtimeResult(value: unknown): value is RealtimeResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RealtimeResult>;
  return candidate.type === "realtime_result" && Array.isArray(candidate.faces);
}
