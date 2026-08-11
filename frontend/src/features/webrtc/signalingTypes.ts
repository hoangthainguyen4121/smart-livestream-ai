export type WebrtcRole = "host" | "viewer";

export type WebrtcJoinMessage = {
  type: "webrtc_join";
  room_id: string;
  peer_id: string;
  role: WebrtcRole;
};

export type WebrtcLeaveMessage = {
  type: "webrtc_leave";
  room_id: string;
  peer_id: string;
  role?: WebrtcRole;
};

export type HostMediaStartedMessage = {
  type: "host_media_started";
  room_id: string;
  peer_id: string;
  role?: WebrtcRole;
};

export type HostMediaStoppedMessage = {
  type: "host_media_stopped";
  room_id: string;
  peer_id: string;
  role?: WebrtcRole;
};

export type WebrtcOfferMessage = {
  type: "webrtc_offer";
  room_id: string;
  peer_id: string;
  target_peer_id: string;
  sdp: RTCSessionDescriptionInit;
};

export type WebrtcAnswerMessage = {
  type: "webrtc_answer";
  room_id: string;
  peer_id: string;
  target_peer_id: string;
  sdp: RTCSessionDescriptionInit;
};

export type WebrtcIceCandidateMessage = {
  type: "webrtc_ice_candidate";
  room_id: string;
  peer_id: string;
  target_peer_id: string;
  candidate: RTCIceCandidateInit | null;
};

export type WebrtcSignalingMessage =
  | WebrtcJoinMessage
  | WebrtcLeaveMessage
  | HostMediaStartedMessage
  | HostMediaStoppedMessage
  | WebrtcOfferMessage
  | WebrtcAnswerMessage
  | WebrtcIceCandidateMessage;

export function isWebrtcSignalingMessage(value: unknown): value is WebrtcSignalingMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return (
    type === "webrtc_join" ||
    type === "webrtc_leave" ||
    type === "host_media_started" ||
    type === "host_media_stopped" ||
    type === "webrtc_offer" ||
    type === "webrtc_answer" ||
    type === "webrtc_ice_candidate"
  );
}
