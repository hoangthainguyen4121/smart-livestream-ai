/**
 * Paint an HTMLVideoElement onto a capture canvas so existing CV hooks can
 * sample the same FrameSource contract as the live camera pipeline.
 */

import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../browser-ar/types";
import { drawVideoFrame } from "../browser-ar/runtime/mirrorVideoFrame";

export type VideoCanvasFrameSource = {
  canvas: HTMLCanvasElement;
  getCanvasElement: () => HTMLCanvasElement | null;
  start: (video: HTMLVideoElement) => void;
  stop: () => void;
  paintOnce: () => boolean;
};

export function createVideoCanvasFrameSource(
  canvas: HTMLCanvasElement,
  options?: { width?: number; height?: number },
): VideoCanvasFrameSource {
  const width = options?.width ?? CAPTURE_WIDTH;
  const height = options?.height ?? CAPTURE_HEIGHT;
  canvas.width = width;
  canvas.height = height;

  let videoEl: HTMLVideoElement | null = null;
  let raf = 0;
  let running = false;

  const paintOnce = (): boolean => {
    if (!videoEl) {
      return false;
    }
    if (videoEl.readyState < 2) {
      return false;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return false;
    }
    // File video is not a selfie camera — do not mirror.
    drawVideoFrame(ctx, videoEl, width, height, false);
    return true;
  };

  const tick = () => {
    if (!running) {
      return;
    }
    paintOnce();
    raf = window.requestAnimationFrame(tick);
  };

  return {
    canvas,
    getCanvasElement: () => canvas,
    start: (video: HTMLVideoElement) => {
      videoEl = video;
      if (running) {
        return;
      }
      running = true;
      raf = window.requestAnimationFrame(tick);
    },
    stop: () => {
      running = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      videoEl = null;
    },
    paintOnce,
  };
}
