export type RealtimeMessage = {
  type: string;
  frame?: string;
  timestamp?: number;
};

export function createRealtimeSocket() {
  return new WebSocket("ws://127.0.0.1:8000/ws/realtime");
}
