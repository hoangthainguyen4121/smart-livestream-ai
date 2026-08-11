import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";
import type { VideoCaptureSource } from "./videoCaptureSource";

export async function acquireVideoStream(source: VideoCaptureSource): Promise<MediaStream> {
  if (source === "file") {
    throw new Error("video_source_file_is_not_a_mediastream");
  }
  if (source === "screen") {
    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
  }

  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: CAPTURE_WIDTH },
      height: { ideal: CAPTURE_HEIGHT },
    },
  });
}
