import { useEffect, useMemo, useRef } from "react";

import { createChatSocket } from "../../api/chat";
import { getOrCreateWebrtcPeerId } from "./peerId";
import {
  isWebrtcSignalingMessage,
  type WebrtcRole,
  type WebrtcSignalingMessage,
} from "./signalingTypes";

type UseRoomWebRtcSignalingOptions = {
  roomId: string;
  role: WebrtcRole;
  enabled: boolean;
  onMessage: (message: WebrtcSignalingMessage) => void;
  /** Override stable peer id (directory previews need unique ids per card). */
  peerId?: string;
};

export type WebRtcSignalingApi = {
  peerId: string;
  send: (message: Record<string, unknown>) => void;
};

export function useRoomWebRtcSignaling({
  roomId,
  role,
  enabled,
  onMessage,
  peerId: peerIdOverride,
}: UseRoomWebRtcSignalingOptions): WebRtcSignalingApi {
  const peerIdRef = useRef(peerIdOverride?.trim() || getOrCreateWebrtcPeerId());
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const roomIdRef = useRef(roomId);
  onMessageRef.current = onMessage;
  roomIdRef.current = roomId;

  useEffect(() => {
    if (!enabled || !roomId) {
      return;
    }

    const socket = createChatSocket(roomId);
    socketRef.current = socket;
    const peerId = peerIdRef.current;

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: "webrtc_join",
          room_id: roomId,
          peer_id: peerId,
          role,
        }),
      );
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as unknown;
        if (isWebrtcSignalingMessage(payload) && payload.room_id === roomId) {
          onMessageRef.current(payload);
        }
      } catch {
        // ignore non-json / non-webrtc
      }
    };

    return () => {
      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "webrtc_leave",
              room_id: roomId,
              peer_id: peerId,
              role,
            }),
          );
        }
      } catch {
        // ignore
      }
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [enabled, roomId, role]);

  return useMemo(
    () => ({
      peerId: peerIdRef.current,
      send: (message: Record<string, unknown>) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }
        socket.send(
          JSON.stringify({
            ...message,
            room_id: roomIdRef.current,
            peer_id: message.peer_id ?? peerIdRef.current,
          }),
        );
      },
    }),
    [],
  );
}
