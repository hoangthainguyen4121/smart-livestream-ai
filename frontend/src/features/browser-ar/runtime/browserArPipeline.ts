import { FaceLandmarkerEngine } from "../engines/faceLandmarkerEngine";
import { FpsMonitor } from "../metrics/fpsMonitor";
import { acquireVideoStream } from "./acquireVideoStream";
import { shouldFallbackPaint } from "./paintSchedule";
import {
  drawMirroredVideoFrame,
  drawVideoFrame,
  mirrorDetectionForCanvas,
} from "./mirrorVideoFrame";
import type { VideoCaptureSource } from "./videoCaptureSource";
import { waitForVideoReady } from "./waitForVideoReady";
import { renderBrowserArEffect } from "../renderers/renderBrowserArEffect";
import type { ArDetectionResult, BrowserArEffect, BrowserArStats } from "../types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";

/** Cap for rAF-stall recovery while host window is occluded but tab still "visible". */
const FALLBACK_PAINT_INTERVAL_MS = Math.round(1000 / 15);

export type BrowserArPipelineOptions = {
  effect: BrowserArEffect;
  debugOverlay: boolean;
  hostLabel?: string;
  videoSource?: VideoCaptureSource;
  onStats?: (stats: BrowserArStats) => void;
  onScreenShareEnded?: () => void;
};

export class BrowserArPipeline {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private engine: FaceLandmarkerEngine | null = null;
  private animationFrame = 0;
  private fallbackTimerId = 0;
  private lastPaintAtMs = 0;
  private running = false;
  private processing = false;
  private lastDetection: ArDetectionResult | null = null;
  private readonly cameraFps = new FpsMonitor();
  private readonly processingFps = new FpsMonitor();
  private options: BrowserArPipelineOptions | null = null;
  private errorMessage: string | null = null;
  private videoSource: VideoCaptureSource = "camera";
  private trackEndedHandler: (() => void) | null = null;
  private latestStats: BrowserArStats = {
    cameraFps: 0,
    processingFps: 0,
    inferenceMs: 0,
    renderMs: 0,
    effect: "none",
    errorMessage: null,
  };

  async start(canvas: HTMLCanvasElement, options: BrowserArPipelineOptions): Promise<void> {
    await this.stop();
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    if (!this.context) {
      throw new Error("Unable to acquire 2D canvas context.");
    }

    this.options = options;
    this.videoSource = options.videoSource ?? "camera";
    this.canvas.width = CAPTURE_WIDTH;
    this.canvas.height = CAPTURE_HEIGHT;
    this.errorMessage = null;
    this.cameraFps.reset();
    this.processingFps.reset();

    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;

    await this.attachStream(this.videoSource);
    this.running = true;
    this.startFallbackPainter();
    this.loop();
    await this.syncEngine();
  }

  async switchSource(source: VideoCaptureSource): Promise<void> {
    if (!this.video || !this.canvas || !this.options || !this.running) {
      return;
    }

    if (source === this.videoSource) {
      return;
    }

    this.videoSource = source;
    await this.attachStream(source);
    await this.syncEngine();
  }

  getVideoSource(): VideoCaptureSource {
    return this.videoSource;
  }

  async setEffect(effect: BrowserArEffect): Promise<void> {
    if (!this.options) {
      return;
    }

    this.options = { ...this.options, effect };
    await this.syncEngine();
  }

  setDebugOverlay(debugOverlay: boolean): void {
    if (!this.options) {
      return;
    }
    this.options = { ...this.options, debugOverlay };
    void this.syncEngine();
  }

  captureFrame(): ImageData | null {
    if (!this.video || !this.canvas) {
      return null;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const context = tempCanvas.getContext("2d");
    if (!context) {
      return null;
    }

    drawVideoFrame(
      context,
      this.video,
      tempCanvas.width,
      tempCanvas.height,
      this.shouldMirrorVideo(),
    );
    return context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** Raw camera/screen MediaStream owned by the pipeline (do not stop from WebRTC). */
  getSourceMediaStream(): MediaStream | null {
    return this.stream;
  }

  getLastPaintAtMs(): number {
    return this.lastPaintAtMs;
  }

  private async attachStream(source: VideoCaptureSource): Promise<void> {
    if (!this.video) {
      throw new Error("Video element is not initialized.");
    }

    this.detachTrackEndedHandler();
    this.releaseStreamTracks();

    this.stream = await acquireVideoStream(source);
    this.video.srcObject = this.stream;
    await this.video.play();
    await waitForVideoReady(this.video);
    this.bindTrackEndedHandler(source);
  }

  private bindTrackEndedHandler(source: VideoCaptureSource): void {
    if (source !== "screen" || !this.stream) {
      return;
    }

    const [videoTrack] = this.stream.getVideoTracks();
    if (!videoTrack) {
      return;
    }

    this.trackEndedHandler = () => {
      this.options?.onScreenShareEnded?.();
    };
    videoTrack.addEventListener("ended", this.trackEndedHandler);
  }

  private detachTrackEndedHandler(): void {
    if (!this.stream || !this.trackEndedHandler) {
      this.trackEndedHandler = null;
      return;
    }

    for (const track of this.stream.getVideoTracks()) {
      track.removeEventListener("ended", this.trackEndedHandler);
    }
    this.trackEndedHandler = null;
  }

  private releaseStreamTracks(): void {
    if (!this.stream) {
      return;
    }

    this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private shouldMirrorVideo(): boolean {
    return this.videoSource === "camera";
  }

  private shouldRunFaceAr(): boolean {
    if (!this.options || this.videoSource === "screen") {
      return false;
    }

    return this.options.effect !== "none" || this.options.debugOverlay;
  }

  private async syncEngine(): Promise<void> {
    if (!this.options) {
      return;
    }

    const needsEngine = this.shouldRunFaceAr();
    if (needsEngine && !this.engine) {
      this.engine = new FaceLandmarkerEngine();
      await this.engine.init();
    }
    if (!needsEngine) {
      this.engine?.close();
      this.engine = null;
      this.lastDetection = null;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopFallbackPainter();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    this.engine?.close();
    this.engine = null;
    this.lastDetection = null;
    this.lastPaintAtMs = 0;

    this.detachTrackEndedHandler();
    this.releaseStreamTracks();

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  /**
   * When the host window is occluded, Chrome often pauses rAF while the tab
   * remains visibilityState=visible. A capped timer keeps canvas.captureStream
   * receiving paints without a busy-loop or extra MediaPipe inference.
   */
  private startFallbackPainter(): void {
    this.stopFallbackPainter();
    this.fallbackTimerId = window.setInterval(() => {
      if (!this.running) {
        return;
      }
      if (
        !shouldFallbackPaint(
          performance.now(),
          this.lastPaintAtMs,
          FALLBACK_PAINT_INTERVAL_MS,
        )
      ) {
        return;
      }
      this.paintCompositeFromCache();
    }, FALLBACK_PAINT_INTERVAL_MS);
  }

  private stopFallbackPainter(): void {
    if (this.fallbackTimerId) {
      window.clearInterval(this.fallbackTimerId);
      this.fallbackTimerId = 0;
    }
  }

  private markPainted(): void {
    this.lastPaintAtMs = performance.now();
  }

  private paintCompositeFromCache(): void {
    if (!this.video || !this.context || !this.canvas || !this.options) {
      return;
    }
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    drawVideoFrame(
      this.context,
      this.video,
      this.canvas.width,
      this.canvas.height,
      this.shouldMirrorVideo(),
    );

    if (this.shouldRunFaceAr() && this.lastDetection) {
      renderBrowserArEffect(this.context, this.options.effect, this.lastDetection, {
        debugOverlay: this.options.debugOverlay,
        hostLabel: this.options.hostLabel,
      });
    }

    this.markPainted();
  }

  private loop = (): void => {
    if (!this.running || !this.video || !this.context || !this.canvas || !this.options) {
      return;
    }

    this.animationFrame = requestAnimationFrame(this.loop);
    const cameraFps = this.cameraFps.tick();
    let inferenceMs = 0;
    let renderMs = 0;
    let processingFps = this.processingFps.averageFps;

    drawVideoFrame(
      this.context,
      this.video,
      this.canvas.width,
      this.canvas.height,
      this.shouldMirrorVideo(),
    );
    this.markPainted();

    const needsProcessing =
      this.shouldRunFaceAr() &&
      this.engine !== null &&
      this.video.videoWidth > 0 &&
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

    if (needsProcessing && this.engine) {
      if (this.processing) {
        return;
      }

      this.processing = true;
      void this.processFrame(cameraFps)
        .then(({ inference, render }) => {
          inferenceMs = inference;
          renderMs = render;
          processingFps = this.processingFps.tick();
          this.publishStats(cameraFps, processingFps, inferenceMs, renderMs);
        })
        .catch((error) => {
          this.errorMessage =
            error instanceof Error ? error.message : "Browser AR processing failed.";
          this.publishStats(cameraFps, processingFps, inferenceMs, renderMs);
        })
        .finally(() => {
          this.processing = false;
        });
      return;
    }

    processingFps = cameraFps;
    this.publishStats(cameraFps, processingFps, 0, 0);
  };

  private async processFrame(
    cameraFps: number,
  ): Promise<{ inference: number; render: number }> {
    if (!this.video || !this.context || !this.canvas || !this.options || !this.engine) {
      return { inference: 0, render: 0 };
    }

    const detection = await this.engine.detect(this.video, performance.now());
    if (detection) {
      this.lastDetection = mirrorDetectionForCanvas(
        detection,
        this.video,
        this.canvas.width,
        this.canvas.height,
      );
    }

    drawMirroredVideoFrame(this.context, this.video, this.canvas.width, this.canvas.height);
    const renderMs = renderBrowserArEffect(
      this.context,
      this.options.effect,
      this.lastDetection,
      {
        debugOverlay: this.options.debugOverlay,
        hostLabel: this.options.hostLabel,
      },
    );
    this.markPainted();

    return {
      inference: detection?.inferenceMs ?? this.lastDetection?.inferenceMs ?? 0,
      render: renderMs,
    };
  }

  private publishStats(
    cameraFps: number,
    processingFps: number,
    inferenceMs: number,
    renderMs: number,
  ): void {
    if (!this.options) {
      return;
    }

    this.latestStats = {
      cameraFps,
      processingFps,
      inferenceMs,
      renderMs,
      effect: this.options.effect,
      errorMessage: this.errorMessage,
    };
    this.options.onStats?.(this.latestStats);
  }
}
