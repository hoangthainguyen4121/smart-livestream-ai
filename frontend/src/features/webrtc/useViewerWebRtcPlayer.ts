import { useEffect, useRef, useState } from "react";

import { getRtcConfiguration } from "./rtcConfig";
import type { WebrtcSignalingMessage } from "./signalingTypes";
import { useRoomWebRtcSignaling } from "./useRoomWebRtcSignaling";

export type ViewerMediaState = "waiting" | "live" | "host_stopped";

type UseViewerWebRtcPlayerOptions = {
  roomId: string;
  enabled: boolean;
  /** Unique peer id for this viewer/preview connection. */
  peerId?: string;
};

export function useViewerWebRtcPlayer({
  roomId,
  enabled,
  peerId,
}: UseViewerWebRtcPlayerOptions): {
  remoteStream: MediaStream | null;
  mediaState: ViewerMediaState;
} {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaState, setMediaState] = useState<ViewerMediaState>("waiting");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hostPeerIdRef = useRef<string | null>(null);
  const signalingRef = useRef<ReturnType<typeof useRoomWebRtcSignaling> | null>(null);

  const cleanupPc = () => {
    const pc = pcRef.current;
    if (!pc) {
      return;
    }
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pcRef.current = null;
  };

  const ensurePc = (hostPeerId: string, options?: { forceNew?: boolean }) => {
    const signaling = signalingRef.current;
    if (!signaling) {
      return null;
    }
    const forceNew = options?.forceNew === true;
    const existing = pcRef.current;
    const reusable =
      !forceNew &&
      existing &&
      hostPeerIdRef.current === hostPeerId &&
      existing.connectionState !== "failed" &&
      existing.connectionState !== "closed" &&
      existing.signalingState !== "closed";
    if (reusable) {
      return existing;
    }
    cleanupPc();
    hostPeerIdRef.current = hostPeerId;
    const pc = new RTCPeerConnection(getRtcConfiguration());
    pcRef.current = pc;

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
      setMediaState("live");
    };

    pc.onicecandidate = (event) => {
      signaling.send({
        type: "webrtc_ice_candidate",
        target_peer_id: hostPeerId,
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // Keep waiting UI; host may renegotiate.
      }
    };

    return pc;
  };

  const handleMessage = (message: WebrtcSignalingMessage) => {
    const signaling = signalingRef.current;
    if (!signaling || message.peer_id === signaling.peerId) {
      return;
    }

    if (message.type === "host_media_started") {
      hostPeerIdRef.current = message.peer_id;
      setMediaState((current) => (current === "live" ? current : "waiting"));
      // Re-announce join so host creates a fresh offer for this viewer.
      signaling.send({ type: "webrtc_join", role: "viewer" });
      return;
    }

    if (message.type === "host_media_stopped") {
      cleanupPc();
      setRemoteStream(null);
      setMediaState("host_stopped");
      return;
    }

    if (message.type === "webrtc_leave" && message.peer_id === hostPeerIdRef.current) {
      cleanupPc();
      setRemoteStream(null);
      setMediaState("waiting");
      return;
    }

    if (message.type === "webrtc_offer" && message.target_peer_id === signaling.peerId) {
      // Fresh offer from host (including after host refresh) → new PC.
      const pc = ensurePc(message.peer_id, { forceNew: true });
      if (!pc) {
        return;
      }
      void (async () => {
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.send({
          type: "webrtc_answer",
          target_peer_id: message.peer_id,
          sdp: answer,
        });
      })();
      return;
    }

    if (message.type === "webrtc_ice_candidate" && message.target_peer_id === signaling.peerId) {
      const pc = pcRef.current;
      if (!pc || !message.candidate) {
        return;
      }
      void pc.addIceCandidate(message.candidate);
    }
  };

  const signaling = useRoomWebRtcSignaling({
    roomId,
    role: "viewer",
    enabled,
    peerId,
    onMessage: handleMessage,
  });
  signalingRef.current = signaling;

  useEffect(() => {
    if (!enabled) {
      cleanupPc();
      setRemoteStream(null);
      setMediaState("waiting");
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      cleanupPc();
      setRemoteStream(null);
    };
  }, []);

  return { remoteStream, mediaState };
}
