const DEFAULT_CAPTURE_FPS = 24;

/** Capture processed Browser AR canvas for WebRTC (viewer sees same AR output). */
export function createOutboundCanvasStream(
  canvas: HTMLCanvasElement | null,
  fps = DEFAULT_CAPTURE_FPS,
): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== "function") {
    return null;
  }
  const stream = canvas.captureStream(fps);
  if (!stream.getVideoTracks().length) {
    return null;
  }
  return stream;
}

export function stopLocalMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
