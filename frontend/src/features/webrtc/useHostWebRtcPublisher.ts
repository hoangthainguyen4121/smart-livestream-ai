import { useEffect, useRef } from "react";

import { createOutboundCanvasStream, stopLocalMediaStream } from "./createOutboundCanvasStream";
import {
  pickOutboundVideoTrack,
  resolveOutboundTrackMode,
  type OutboundTrackMode,
} from "./outboundTrackPolicy";
import { replaceVideoSenderTrack } from "./replaceSenderTrack";
import { getRtcConfiguration } from "./rtcConfig";
import type { WebrtcSignalingMessage } from "./signalingTypes";
import { useRoomWebRtcSignaling } from "./useRoomWebRtcSignaling";

type UseHostWebRtcPublisherOptions = {
  roomId: string;
  /** Host role in this room (signaling). Must be false for viewers. */
  isHost: boolean;
  /** Camera/screen currently publishing. */
  mediaEnabled: boolean;
  getCanvas: () => HTMLCanvasElement | null;
  /** Raw camera/screen stream from BrowserArPipeline (not owned by WebRTC). */
  getSourceStream: () => MediaStream | null;
};

export function useHostWebRtcPublisher({
  roomId,
  isHost,
  mediaEnabled,
  getCanvas,
  getSourceStream,
}: UseHostWebRtcPublisherOptions): void {
  const outboundStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewersRef = useRef<Set<string>>(new Set());
  const mediaLiveRef = useRef(false);
  const modeRef = useRef<OutboundTrackMode>("processed");
  const signalingRef = useRef<ReturnType<typeof useRoomWebRtcSignaling> | null>(null);
  const getCanvasRef = useRef(getCanvas);
  const getSourceStreamRef = useRef(getSourceStream);
  getCanvasRef.current = getCanvas;
  getSourceStreamRef.current = getSourceStream;

  const closePeer = (viewerId: string) => {
    const pc = peersRef.current.get(viewerId);
    if (!pc) {
      return;
    }
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.close();
    peersRef.current.delete(viewerId);
  };

  const closeAllPeers = () => {
    for (const viewerId of [...peersRef.current.keys()]) {
      closePeer(viewerId);
    }
  };

  const ensureOutboundStream = (): MediaStream | null => {
    if (outboundStreamRef.current) {
      const live = outboundStreamRef.current.getVideoTracks().some((track) => track.readyState === "live");
      if (live) {
        return outboundStreamRef.current;
      }
      stopLocalMediaStream(outboundStreamRef.current);
      outboundStreamRef.current = null;
    }
    const stream = createOutboundCanvasStream(getCanvasRef.current());
    outboundStreamRef.current = stream;
    return stream;
  };

  const currentOutboundTrack = (): MediaStreamTrack | null => {
    const mode = resolveOutboundTrackMode(
      typeof document !== "undefined" ? document.visibilityState : "visible",
    );
    modeRef.current = mode;
    const processed = ensureOutboundStream()?.getVideoTracks()[0] ?? null;
    const raw = getSourceStreamRef.current()?.getVideoTracks()[0] ?? null;
    return pickOutboundVideoTrack({
      mode,
      processedTrack: processed,
      rawTrack: raw,
    });
  };

  const syncSenderTracks = () => {
    const track = currentOutboundTrack();
    if (!track) {
      return;
    }
    for (const pc of peersRef.current.values()) {
      void replaceVideoSenderTrack(pc, track);
    }
  };

  const offerToViewer = async (viewerId: string) => {
    const signaling = signalingRef.current;
    if (!signaling || !mediaLiveRef.current) {
      return;
    }
    const stream = ensureOutboundStream();
    const track = currentOutboundTrack();
    if (!stream || !track) {
      return;
    }

    closePeer(viewerId);
    const pc = new RTCPeerConnection(getRtcConfiguration());
    peersRef.current.set(viewerId, pc);

    // Associate the active track (processed canvas or raw camera/screen).
    pc.addTrack(track, new MediaStream([track]));

    pc.onicecandidate = (event) => {
      signaling.send({
        type: "webrtc_ice_candidate",
        target_peer_id: viewerId,
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        closePeer(viewerId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.send({
      type: "webrtc_offer",
      target_peer_id: viewerId,
      sdp: offer,
    });
  };

  const handleMessage = (message: WebrtcSignalingMessage) => {
    const signaling = signalingRef.current;
    if (!signaling || message.peer_id === signaling.peerId) {
      return;
    }

    if (message.type === "webrtc_join" && message.role === "viewer") {
      viewersRef.current.add(message.peer_id);
      if (mediaLiveRef.current) {
        void offerToViewer(message.peer_id);
      }
      return;
    }

    if (message.type === "webrtc_leave") {
      viewersRef.current.delete(message.peer_id);
      closePeer(message.peer_id);
      return;
    }

    if (message.type === "webrtc_answer" && message.target_peer_id === signaling.peerId) {
      const pc = peersRef.current.get(message.peer_id);
      if (!pc) {
        return;
      }
      void pc.setRemoteDescription(message.sdp);
      return;
    }

    if (message.type === "webrtc_ice_candidate" && message.target_peer_id === signaling.peerId) {
      const pc = peersRef.current.get(message.peer_id);
      if (!pc || !message.candidate) {
        return;
      }
      void pc.addIceCandidate(message.candidate);
    }
  };

  const signaling = useRoomWebRtcSignaling({
    roomId,
    role: "host",
    enabled: Boolean(roomId) && isHost,
    onMessage: handleMessage,
  });
  signalingRef.current = signaling;

  const wasLiveRef = useRef(false);

  useEffect(() => {
    const publishing = isHost && mediaEnabled;
    mediaLiveRef.current = publishing;

    if (!publishing) {
      closeAllPeers();
      // Only stop canvas-capture tracks. Raw camera/screen stays owned by BrowserArPipeline.
      stopLocalMediaStream(outboundStreamRef.current);
      outboundStreamRef.current = null;
      if (wasLiveRef.current && isHost) {
        signaling.send({ type: "host_media_stopped", role: "host" });
      }
      wasLiveRef.current = false;
      return;
    }

    wasLiveRef.current = true;
    let attempts = 0;
    const tryPublish = () => {
      attempts += 1;
      const stream = ensureOutboundStream();
      if (!stream) {
        if (attempts < 20) {
          timer = window.setTimeout(tryPublish, 150);
        }
        return;
      }
      signaling.send({ type: "host_media_started", role: "host" });
      for (const viewerId of viewersRef.current) {
        void offerToViewer(viewerId);
      }
      syncSenderTracks();
    };
    let timer = window.setTimeout(tryPublish, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isHost, mediaEnabled, roomId]);

  useEffect(() => {
    const publishing = isHost && mediaEnabled;
    if (!publishing) {
      return;
    }

    const onVisibility = () => {
      syncSenderTracks();
    };

    document.addEventListener("visibilitychange", onVisibility);
    // Keep raw track in sync after camera↔screen switches while tab is hidden.
    const syncTimer = window.setInterval(() => {
      syncSenderTracks();
    }, 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(syncTimer);
    };
  }, [isHost, mediaEnabled, roomId]);

  useEffect(() => {
    return () => {
      closeAllPeers();
      stopLocalMediaStream(outboundStreamRef.current);
      outboundStreamRef.current = null;
    };
  }, []);
}
