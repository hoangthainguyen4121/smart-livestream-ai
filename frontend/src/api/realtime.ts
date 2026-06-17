export type RealtimeMessage = {
  type: string;
  frame?: string;
  timestamp?: number;
};

export type RealtimeFace = {
  username: string;
  confidence: number;
  bbox: [number, number, number, number];
};

export type RealtimeResult = {
  type: "realtime_result";
  faces: RealtimeFace[];
  gestures: unknown[];
  metrics: {
    latency_ms: number;
    fps: number;
  };
};

export function createRealtimeSocket() {
  return new WebSocket("ws://127.0.0.1:8000/ws/realtime");
}
