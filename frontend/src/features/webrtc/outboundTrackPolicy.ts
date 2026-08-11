export type OutboundTrackMode = "processed" | "raw";

/**
 * Prefer processed canvas while the host document is visible.
 * When the tab is hidden, Chrome throttles rAF/timers — use the raw
 * camera/screen track so WebRTC keeps moving without canvas paints.
 *
 * Note: raw camera is not selfie-mirrored (host local canvas is). A prior
 * experiment forced camera→processed for thumbs/viewers but hurt thumb lag;
 * keep the visibility-based raw fallback for performance.
 */
export function resolveOutboundTrackMode(
  visibilityState: DocumentVisibilityState,
): OutboundTrackMode {
  return visibilityState === "hidden" ? "raw" : "processed";
}

export function pickOutboundVideoTrack(options: {
  mode: OutboundTrackMode;
  processedTrack: MediaStreamTrack | null | undefined;
  rawTrack: MediaStreamTrack | null | undefined;
}): MediaStreamTrack | null {
  const preferred =
    options.mode === "raw" ? options.rawTrack : options.processedTrack;
  if (preferred && preferred.readyState === "live") {
    return preferred;
  }
  // Keep livestream alive if the preferred source is unavailable.
  const fallback =
    options.mode === "raw" ? options.processedTrack : options.rawTrack;
  if (fallback && fallback.readyState === "live") {
    return fallback;
  }
  return null;
}
