import { useEffect, useRef, useState } from "react";

import type { VideoCaptureSource } from "../browser-ar/runtime/videoCaptureSource";
import { useI18n } from "../../i18n/I18nProvider";
import { ObjectDetectorEngine } from "./objectDetectorEngine";
import {
  DEFAULT_INFERENCE_INTERVAL_MS,
  DEFAULT_MAX_DETECTIONS,
  DEFAULT_SCORE_THRESHOLD,
  filterProductDetections,
  resolveProductDetectionStatus,
  shouldAcceptDetectionEpoch,
  shouldRunProductDetection,
  type ProductDetectionStatus,
} from "./productDetectionPolicy";
import {
  EMPTY_OBJECT_DETECTOR_SNAPSHOT,
  type ObjectDetectorHit,
  type ObjectDetectorSnapshot,
} from "./objectDetectorTypes";
import { filterScoredDetections } from "./visualModerationPolicy";

type UseObjectDetectorOverlayOptions = {
  enabled: boolean;
  isLive: boolean;
  videoSource: VideoCaptureSource;
  getCanvasElement: () => HTMLCanvasElement | null;
  scoreThreshold?: number;
  maxDetections?: number;
  inferenceIntervalMs?: number;
  /** Bump to drop stale boxes (seek / video change on CV test page). */
  resetEpoch?: number;
};

export function useObjectDetectorOverlay(options: UseObjectDetectorOverlayOptions) {
  const { t } = useI18n();
  const engineRef = useRef<ObjectDetectorEngine | null>(null);
  const snapshotRef = useRef<ObjectDetectorSnapshot>(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
  const epochRef = useRef(0);
  const inFlightRef = useRef(false);
  const getCanvasElementRef = useRef(options.getCanvasElement);
  const loadFailedMessageRef = useRef(t("objectDetectorLoadFailed"));
  const runtimeFailedMessageRef = useRef(t("objectDetectorRuntimeFailed"));
  const [snapshot, setSnapshot] = useState<ObjectDetectorSnapshot>(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);

  getCanvasElementRef.current = options.getCanvasElement;
  loadFailedMessageRef.current = t("objectDetectorLoadFailed");
  runtimeFailedMessageRef.current = t("objectDetectorRuntimeFailed");
  snapshotRef.current = snapshot;

  const scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const maxDetections = options.maxDetections ?? DEFAULT_MAX_DETECTIONS;
  const inferenceIntervalMs = options.inferenceIntervalMs ?? DEFAULT_INFERENCE_INTERVAL_MS;
  const isActive = shouldRunProductDetection({
    enabled: options.enabled,
    isLive: options.isLive,
    videoSource: options.videoSource,
  });

  useEffect(() => {
    if (!options.enabled) {
      engineRef.current?.close();
      engineRef.current = null;
      setIsModelReady(false);
      setIsLoading(false);
      setErrorMessage(null);
      snapshotRef.current = EMPTY_OBJECT_DETECTOR_SNAPSHOT;
      setSnapshot(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsModelReady(false);
    setErrorMessage(null);

    const engine = new ObjectDetectorEngine({
      scoreThreshold,
      maxResults: maxDetections,
    });

    void engine
      .init()
      .then(() => {
        if (cancelled) {
          engine.close();
          return;
        }
        engineRef.current = engine;
        setIsModelReady(true);
        setIsLoading(false);
        setErrorMessage(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        engine.close();
        setIsLoading(false);
        setIsModelReady(false);
        setErrorMessage(loadFailedMessageRef.current);
      });

    return () => {
      cancelled = true;
      engine.close();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      setIsModelReady(false);
    };
  }, [options.enabled, scoreThreshold, maxDetections]);

  useEffect(() => {
    epochRef.current += 1;
    if (!isActive) {
      snapshotRef.current = EMPTY_OBJECT_DETECTOR_SNAPSHOT;
      setSnapshot(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
    }
  }, [isActive, options.videoSource, options.isLive]);

  useEffect(() => {
    if (options.resetEpoch === undefined) {
      return;
    }
    epochRef.current += 1;
    snapshotRef.current = EMPTY_OBJECT_DETECTOR_SNAPSHOT;
    setSnapshot(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
  }, [options.resetEpoch]);

  useEffect(() => {
    if (!options.enabled || !isActive || !isModelReady || errorMessage) {
      return undefined;
    }

    let cancelled = false;
    let timerId = 0;

    const schedule = () => {
      timerId = window.setTimeout(tick, inferenceIntervalMs);
    };

    const tick = () => {
      if (cancelled) {
        return;
      }

      const engine = engineRef.current;
      const canvas = getCanvasElementRef.current();
      if (!engine || !canvas || canvas.width <= 0 || canvas.height <= 0) {
        schedule();
        return;
      }

      if (inFlightRef.current) {
        schedule();
        return;
      }

      const resultEpoch = epochRef.current;
      inFlightRef.current = true;
      try {
        const startedAt = performance.now();
        const rawHits: ObjectDetectorHit[] = engine.detectCanvas(canvas).map((hit) => ({
          label: hit.label,
          score: hit.score,
          x: hit.originX,
          y: hit.originY,
          width: hit.width,
          height: hit.height,
        }));

        if (!shouldAcceptDetectionEpoch(resultEpoch, epochRef.current) || cancelled) {
          return;
        }

        const allDetections = filterScoredDetections(rawHits, {
          scoreThreshold,
          maxDetections,
        });
        const detections = filterProductDetections(rawHits, {
          scoreThreshold,
          maxDetections,
        });
        const nextSnapshot: ObjectDetectorSnapshot = {
          detections,
          allDetections,
          inferenceMs: performance.now() - startedAt,
          updatedAt: performance.now(),
          sourceWidth: canvas.width,
          sourceHeight: canvas.height,
        };
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      } catch {
        if (!cancelled) {
          setErrorMessage(runtimeFailedMessageRef.current);
          snapshotRef.current = EMPTY_OBJECT_DETECTOR_SNAPSHOT;
          setSnapshot(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) {
          schedule();
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      inFlightRef.current = false;
    };
  }, [
    options.enabled,
    isActive,
    isModelReady,
    errorMessage,
    inferenceIntervalMs,
    scoreThreshold,
    maxDetections,
  ]);

  const status: ProductDetectionStatus = resolveProductDetectionStatus({
    enabled: options.enabled,
    isLive: options.isLive,
    videoSource: options.videoSource,
    isLoading,
    errorMessage,
    detectionCount: snapshot.detections.length,
  });

  return {
    snapshot,
    isLoading,
    errorMessage,
    status,
    isActive,
  };
}
