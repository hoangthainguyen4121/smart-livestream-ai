import { useEffect, useRef, useState } from "react";

import { createRealtimeSocket, type RealtimeMessage } from "../api/realtime";


const FRAME_INTERVAL_MS = 1000;


export function DemoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [latestResult, setLatestResult] = useState<unknown>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const socket = createRealtimeSocket();
    socketRef.current = socket;

    socket.onopen = () => setSocketStatus("connected");
    socket.onclose = () => setSocketStatus("disconnected");
    socket.onerror = () => setSocketStatus("error");
    socket.onmessage = (event) => {
      try {
        setLatestResult(JSON.parse(event.data));
      } catch {
        setLatestResult(event.data);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!socket || socket.readyState !== WebSocket.OPEN || !video || !canvas) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      canvas.width = 320;
      canvas.height = 240;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const message: RealtimeMessage = {
        type: "frame",
        frame: canvas.toDataURL("image/jpeg", 0.7),
        timestamp: Date.now(),
      };

      socket.send(JSON.stringify(message));
    }, FRAME_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Smart Livestream AI MVP</p>
        <h1>Web Demo</h1>
        <p>
          Browser camera preview with a basic WebSocket debug loop. AI overlays will be
          added in later steps.
        </p>
      </section>

      <section className="layout">
        <div className="card">
          <div className="cardHeader">
            <h2>Camera Preview</h2>
            <span className={`status ${socketStatus}`}>WS: {socketStatus}</span>
          </div>

          {cameraError ? (
            <div className="error">Camera error: {cameraError}</div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="video" />
          )}
          <canvas ref={canvasRef} className="hiddenCanvas" />
        </div>

        <div className="card">
          <h2>Realtime Debug Result</h2>
          <pre className="debugPanel">
            {latestResult ? JSON.stringify(latestResult, null, 2) : "Waiting for backend response..."}
          </pre>
        </div>
      </section>
    </main>
  );
}
