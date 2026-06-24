import { FpsMonitor } from "../metrics/fpsMonitor";
import { createArEngine } from "../engines/createArEngine";
import { renderArMode } from "../renderers/renderArMode";
import type {
  ArDetectionResult,
  ArEngine,
  ArEngineId,
  ArLabMode,
  FrameMetrics,
} from "../types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";

export type HarnessSnapshot = {
  cameraFps: number;
  processingFps: number;
  inferenceMs: number;
  renderMs: number;
  droppedFrames: number;
  activeMode: ArLabMode;
  activeEngine: ArEngineId | "none";
  cameraResolution: string;
  browserInfo: string;
  memoryUsedMb: number | null;
  isProcessing: boolean;
  engineReady: boolean;
  errorMessage: string | null;
};

export type HarnessOptions = {
  mode: ArLabMode;
  engineId: ArEngineId;
  onMetrics?: (metrics: FrameMetrics) => void;
  onSnapshot?: (snapshot: HarnessSnapshot) => void;
};

export class ArBenchmarkHarness {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private engine: ArEngine | null = null;
  private animationFrame = 0;
  private running = false;
  private processing = false;
  private droppedFrames = 0;
  private lastDetection: ArDetectionResult | null = null;
  private readonly cameraFps = new FpsMonitor();
  private readonly processingFps = new FpsMonitor();
  private options: HarnessOptions | null = null;
  private errorMessage: string | null = null;

  async start(canvas: HTMLCanvasElement, options: HarnessOptions): Promise<void> {
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
    this.droppedFrames = 0;
    this.cameraFps.reset();
    this.processingFps.reset();

    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: CAPTURE_HEIGHT },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    if (options.mode !== "raw_camera") {
      this.engine = await createArEngine(options.engineId);
    }

    this.running = true;
    this.loop();
  }

  async setMode(mode: ArLabMode): Promise<void> {
    if (!this.options || !this.canvas) {
      return;
    }

    const engineId = this.options.engineId;
    this.options = { ...this.options, mode };
    if (mode === "raw_camera") {
      this.engine?.close();
      this.engine = null;
      this.lastDetection = null;
      return;
    }

    if (!this.engine || this.engine.id !== engineId) {
      this.engine?.close();
      this.engine = await createArEngine(engineId);
    }
  }

  async setEngine(engineId: ArEngineId): Promise<void> {
    if (!this.options || !this.canvas) {
      return;
    }

    this.options = { ...this.options, engineId };
    if (this.options.mode === "raw_camera") {
      return;
    }

    this.engine?.close();
    this.engine = await createArEngine(engineId);
    this.lastDetection = null;
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

    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

    if (this.options.mode !== "raw_camera") {
      if (this.processing) {
        this.droppedFrames += 1;
      } else {
        this.processing = true;
        void this.processFrame()
          .then((result) => {
            inferenceMs = result.inferenceMs;
            renderMs = result.renderMs;
            processingFps = this.processingFps.tick();
            this.emitMetrics(cameraFps, processingFps, inferenceMs, renderMs);
          })
          .catch((error) => {
            this.errorMessage =
              error instanceof Error ? error.message : "AR processing failed unexpectedly.";
          })
          .finally(() => {
            this.processing = false;
          });
      }
    } else {
      processingFps = cameraFps;
      this.emitMetrics(cameraFps, processingFps, 0, 0);
    }

    this.emitSnapshot(cameraFps, processingFps, inferenceMs, renderMs);
  };

  private async processFrame(): Promise<{ inferenceMs: number; renderMs: number }> {
    if (!this.video || !this.context || !this.canvas || !this.options || !this.engine) {
      return { inferenceMs: 0, renderMs: 0 };
    }

    const detection = await this.engine.detect(this.video, performance.now());
    if (detection) {
      this.lastDetection = detection;
    }

    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const renderStartedAt = performance.now();
    if (this.lastDetection) {
      renderArMode(this.context, this.options.mode, this.lastDetection);
    }
    const renderMs = performance.now() - renderStartedAt;
    return {
      inferenceMs: detection?.inferenceMs ?? this.lastDetection?.inferenceMs ?? 0,
      renderMs,
    };
  }

  private emitMetrics(
    cameraFps: number,
    processingFps: number,
    inferenceMs: number,
    renderMs: number,
  ): void {
    if (!this.options) {
      return;
    }

    this.options.onMetrics?.({
      timestamp: performance.now(),
      cameraFps,
      processingFps,
      inferenceMs,
      renderMs,
      droppedFrames: this.droppedFrames,
    });
  }

  private emitSnapshot(
    cameraFps: number,
    processingFps: number,
    inferenceMs: number,
    renderMs: number,
  ): void {
    if (!this.options) {
      return;
    }

    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }).memory;

    this.options.onSnapshot?.({
      cameraFps,
      processingFps,
      inferenceMs,
      renderMs,
      droppedFrames: this.droppedFrames,
      activeMode: this.options.mode,
      activeEngine: this.options.mode === "raw_camera" ? "none" : this.options.engineId,
      cameraResolution: `${this.video?.videoWidth ?? CAPTURE_WIDTH}x${this.video?.videoHeight ?? CAPTURE_HEIGHT}`,
      browserInfo: navigator.userAgent,
      memoryUsedMb: memory ? memory.usedJSHeapSize / (1024 * 1024) : null,
      isProcessing: this.processing,
      engineReady: this.options.mode === "raw_camera" || this.engine !== null,
      errorMessage: this.errorMessage,
    });
  }
}

export function readBrowserInfo(): string {
  const platform = navigator.platform || "unknown";
  return `${navigator.userAgent} | platform=${platform}`;
}
