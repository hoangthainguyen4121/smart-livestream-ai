const WEBRTC_PEER_KEY = "smart-livestream.webrtcPeerId";

export function getOrCreateWebrtcPeerId(): string {
  if (typeof window === "undefined") {
    return "server-peer";
  }
  const existing = window.sessionStorage.getItem(WEBRTC_PEER_KEY);
  if (existing) {
    return existing;
  }
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `peer-${crypto.randomUUID()}`
      : `peer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(WEBRTC_PEER_KEY, created);
  return created;
}
