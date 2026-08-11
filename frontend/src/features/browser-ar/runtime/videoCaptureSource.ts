/** `file` = local video harness (canvas-fed); not a MediaStream capture mode. */
export type VideoCaptureSource = "camera" | "screen" | "file";

export type StreamDisplayStatus = "stopped" | "camera" | "screen" | "file";

export function resolveStreamDisplayStatus(
  isLive: boolean,
  videoSource: VideoCaptureSource,
): StreamDisplayStatus {
  if (!isLive) {
    return "stopped";
  }
  return videoSource;
}
