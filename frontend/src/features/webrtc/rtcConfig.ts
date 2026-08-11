export function getRtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const configured = import.meta.env.VITE_WEBRTC_STUN_URLS?.trim();
  if (configured) {
    const urls = configured
      .split(",")
      .map((entry: string) => entry.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      return { iceServers: [{ urls }] };
    }
  }
  return { iceServers };
}
