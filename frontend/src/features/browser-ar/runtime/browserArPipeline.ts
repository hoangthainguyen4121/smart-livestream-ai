import { FaceLandmarkerEngine } from "../engines/faceLandmarkerEngine";
import { FpsMonitor } from "../metrics/fpsMonitor";
import {
  drawMirroredVideoFrame,
  mirrorDetectionForCanvas,
} from "./mirrorVideoFrame";
import { waitForVideoReady } from "./waitForVideoReady";
import { renderBrowserArEffect } from "../renderers/renderBrowserArEffect";
import type { ArDetectionResult, BrowserArEffect, BrowserArStats } from "../types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";

export type BrowserArPipelineOptions = {
  effect: BrowserArEffect;
  debugOverlay: boolean;
  hostLabel?: string;
  onStats?: (stats: BrowserArStats) => void;
};

export class BrowserArPipeline {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private engine: FaceLandmarkerEngine | null = null;
  private animationFrame = 0;
  private running = false;
  private processing = false;
  private lastDetection: ArDetectionResult | null = null;
  private readonly cameraFps = new FpsMonitor();
  private readonly processingFps = new FpsMonitor();
  private options: BrowserArPipelineOptions | null = null;
  private errorMessage: string | null = null;
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
    this.canvas.width = CAPTURE_WIDTH;
    this.canvas.height = CAPTURE_HEIGHT;
    this.errorMessage = null;
    this.cameraFps.reset();
    this.processingFps.reset();

    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: CAPTURE_HEIGHT },
      },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    await waitForVideoReady(this.video);

    this.running = true;
    this.loop();

    const needsEngine = options.effect !== "none" || options.debugOverlay;
    if (needsEngine) {
      this.engine = new FaceLandmarkerEngine();
      await this.engine.init();
    }
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

    drawMirroredVideoFrame(context, this.video, tempCanvas.width, tempCanvas.height);
    return context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  private async syncEngine(): Promise<void> {
    if (!this.options) {
      return;
    }

    const needsEngine = this.options.effect !== "none" || this.options.debugOverlay;
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
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    this.engine?.close();
    this.engine = null;
    this.lastDetection = null;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
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

    drawMirroredVideoFrame(this.context, this.video, this.canvas.width, this.canvas.height);

    const needsProcessing =
      (this.options.effect !== "none" || this.options.debugOverlay) &&
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
