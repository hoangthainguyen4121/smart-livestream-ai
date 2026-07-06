import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { BrowserArPipeline } from "../runtime/browserArPipeline";
import type { BrowserArEffect, BrowserArStats } from "../types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";

export type BrowserArStreamHandle = {
  captureFrame: () => ImageData | null;
  getVideoElement: () => HTMLVideoElement | null;
  getCanvasElement: () => HTMLCanvasElement | null;
};

type BrowserArStreamProps = {
  isLive: boolean;
  effect: BrowserArEffect;
  debugOverlay: boolean;
  hostLabel?: string;
};

export const BrowserArStream = forwardRef<BrowserArStreamHandle, BrowserArStreamProps>(
  function BrowserArStream(
    { isLive, effect, debugOverlay, hostLabel = "@hoang" },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pipelineRef = useRef<BrowserArPipeline | null>(null);
    const [stats, setStats] = useState<BrowserArStats | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        captureFrame: () => pipelineRef.current?.captureFrame() ?? null,
        getVideoElement: () => pipelineRef.current?.getVideoElement() ?? null,
        getCanvasElement: () => pipelineRef.current?.getCanvasElement() ?? null,
      }),
      [],
    );

    useEffect(() => {
      if (!isLive) {
        void pipelineRef.current?.stop();
        pipelineRef.current = null;
        setStats(null);
        setIsStarting(false);
        return undefined;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return undefined;
      }

      const pipeline = new BrowserArPipeline();
      pipelineRef.current = pipeline;
      setIsStarting(true);
      setErrorMessage(null);

      void pipeline
        .start(canvas, {
          effect,
          debugOverlay,
          hostLabel,
          onStats: setStats,
        })
        .catch((error) => {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to start Browser AR camera.",
          );
        })
        .finally(() => {
          setIsStarting(false);
        });

      return () => {
        void pipeline.stop();
        if (pipelineRef.current === pipeline) {
          pipelineRef.current = null;
        }
      };
    }, [isLive]);

    useEffect(() => {
      const pipeline = pipelineRef.current;
      if (!pipeline || !isLive) {
        return;
      }
      void pipeline.setEffect(effect);
    }, [effect, isLive]);

    useEffect(() => {
      pipelineRef.current?.setDebugOverlay(debugOverlay);
    }, [debugOverlay]);

    if (!isLive) {
      return (
        <div className="streamPlaceholder">
          Stream stopped. Choose an AR effect and click Start Stream.
        </div>
      );
    }

    return (
      <div className="browserArStream">
        <canvas
          ref={canvasRef}
          width={CAPTURE_WIDTH}
          height={CAPTURE_HEIGHT}
          className="video browserArCanvas"
        />
        {isStarting ? <p className="browserArHint">Loading FaceLandmarker model...</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        {stats?.errorMessage ? <p className="error">{stats.errorMessage}</p> : null}
        {debugOverlay && stats ? (
          <div className="metricsRow browserArDebugMetrics">
            <span>Camera {stats.cameraFps.toFixed(1)} FPS</span>
            <span>Process {stats.processingFps.toFixed(1)} FPS</span>
            <span>Inference {stats.inferenceMs.toFixed(1)} ms</span>
            <span>Render {stats.renderMs.toFixed(1)} ms</span>
            <span>Effect {stats.effect}</span>
          </div>
        ) : null}
      </div>
    );
  },
);
