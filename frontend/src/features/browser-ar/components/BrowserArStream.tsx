import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import { BrowserArPipeline } from "../runtime/browserArPipeline";
import type { VideoCaptureSource } from "../runtime/videoCaptureSource";
import type { BrowserArEffect, BrowserArStats } from "../types";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../types";

export type BrowserArStreamHandle = {
  captureFrame: () => ImageData | null;
  getVideoElement: () => HTMLVideoElement | null;
  getCanvasElement: () => HTMLCanvasElement | null;
  getSourceMediaStream: () => MediaStream | null;
};

type BrowserArStreamProps = {
  isLive: boolean;
  videoSource: VideoCaptureSource;
  effect: BrowserArEffect;
  debugOverlay: boolean;
  hostLabel?: string;
  idlePlaceholder?: string;
  onScreenShareEnded?: () => void;
  onStreamStartFailed?: () => void;
};

export const BrowserArStream = forwardRef<BrowserArStreamHandle, BrowserArStreamProps>(
  function BrowserArStream(
    {
      isLive,
      videoSource,
      effect,
      debugOverlay,
      hostLabel = "@hoang",
      idlePlaceholder,
      onScreenShareEnded,
      onStreamStartFailed,
    },
    ref,
  ) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pipelineRef = useRef<BrowserArPipeline | null>(null);
    const startedSourceRef = useRef<VideoCaptureSource | null>(null);
    const onScreenShareEndedRef = useRef(onScreenShareEnded);
    const onStreamStartFailedRef = useRef(onStreamStartFailed);
    const [stats, setStats] = useState<BrowserArStats | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    onScreenShareEndedRef.current = onScreenShareEnded;
    onStreamStartFailedRef.current = onStreamStartFailed;

    useImperativeHandle(
      ref,
      () => ({
        captureFrame: () => pipelineRef.current?.captureFrame() ?? null,
        getVideoElement: () => pipelineRef.current?.getVideoElement() ?? null,
        getCanvasElement: () => pipelineRef.current?.getCanvasElement() ?? null,
        getSourceMediaStream: () => pipelineRef.current?.getSourceMediaStream() ?? null,
      }),
      [],
    );

    useEffect(() => {
      if (!isLive) {
        void pipelineRef.current?.stop();
        pipelineRef.current = null;
        startedSourceRef.current = null;
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
      const initialSource = videoSource;

      void pipeline
        .start(canvas, {
          effect,
          debugOverlay,
          hostLabel,
          videoSource: initialSource,
          onStats: setStats,
          onScreenShareEnded: () => onScreenShareEndedRef.current?.(),
        })
        .then(() => {
          startedSourceRef.current = initialSource;
        })
        .catch((error) => {
          setErrorMessage(
            error instanceof Error ? error.message : t("streamStartError"),
          );
          onStreamStartFailedRef.current?.();
        })
        .finally(() => {
          setIsStarting(false);
        });

      return () => {
        void pipeline.stop();
        if (pipelineRef.current === pipeline) {
          pipelineRef.current = null;
          startedSourceRef.current = null;
        }
      };
      // Start/stop owns the pipeline lifecycle; source switches use switchSource below.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only remount on isLive
    }, [isLive]);

    useEffect(() => {
      const pipeline = pipelineRef.current;
      if (!pipeline || !isLive || startedSourceRef.current === null) {
        return;
      }
      if (startedSourceRef.current === videoSource) {
        return;
      }

      setIsStarting(true);
      setErrorMessage(null);
      void pipeline
        .switchSource(videoSource)
        .then(() => {
          startedSourceRef.current = videoSource;
        })
        .catch((error) => {
          setErrorMessage(
            error instanceof Error ? error.message : t("streamSourceSwitchError"),
          );
          onScreenShareEnded?.();
        })
        .finally(() => {
          setIsStarting(false);
        });
    }, [isLive, onScreenShareEnded, t, videoSource]);

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
          {idlePlaceholder ?? t("streamStoppedPlaceholder")}
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
        {isStarting ? <p className="browserArHint">{t("streamStartingHint")}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        {stats?.errorMessage ? <p className="error">{stats.errorMessage}</p> : null}
        {debugOverlay && stats ? (
          <div className="metricsRow browserArDebugMetrics">
            <span>{t("streamDebugCameraFps", { fps: stats.cameraFps.toFixed(1) })}</span>
            <span>{t("streamDebugProcessFps", { fps: stats.processingFps.toFixed(1) })}</span>
            <span>{t("streamDebugInferenceMs", { ms: stats.inferenceMs.toFixed(1) })}</span>
            <span>{t("streamDebugRenderMs", { ms: stats.renderMs.toFixed(1) })}</span>
            <span>{t("streamDebugEffect", { effect: stats.effect })}</span>
          </div>
        ) : null}
      </div>
    );
  },
);
