import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n/I18nProvider";
import { ObjectDetectorEngine } from "./objectDetectorEngine";
import {
  EMPTY_OBJECT_DETECTOR_SNAPSHOT,
  type ObjectDetectorSnapshot,
} from "./objectDetectorTypes";

const INFERENCE_INTERVAL_MS = 80;

type UseObjectDetectorOverlayOptions = {
  enabled: boolean;
  isLive: boolean;
  getCanvasElement: () => HTMLCanvasElement | null;
};

export function useObjectDetectorOverlay(options: UseObjectDetectorOverlayOptions) {
  const { t } = useI18n();
  const engineRef = useRef<ObjectDetectorEngine | null>(null);
  const snapshotRef = useRef<ObjectDetectorSnapshot>(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
  const [snapshot, setSnapshot] = useState<ObjectDetectorSnapshot>(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  snapshotRef.current = snapshot;

  useEffect(() => {
    if (!options.enabled) {
      engineRef.current?.close();
      engineRef.current = null;
      snapshotRef.current = EMPTY_OBJECT_DETECTOR_SNAPSHOT;
      setSnapshot(EMPTY_OBJECT_DETECTOR_SNAPSHOT);
      setIsLoading(false);
      setErrorMessage(null);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    const engine = new ObjectDetectorEngine();
    void engine
      .init()
      .then(() => {
        if (cancelled) {
          engine.close();
          return;
        }
        engineRef.current = engine;
        setIsLoading(false);
        setErrorMessage(null);
      })
      .catch((error) => {
        setIsLoading(false);
        setErrorMessage(
          error instanceof Error ? error.message : t("objectDetectorLoadFailed"),
        );
      });

    return () => {
      cancelled = true;
      engine.close();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [options.enabled]);

  useEffect(() => {
    if (!options.enabled || !options.isLive) {
      return undefined;
    }

    let cancelled = false;
    let lastInferenceAt = 0;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const now = performance.now();
      const canvas = options.getCanvasElement();
      const engine = engineRef.current;

      if (canvas && engine && now - lastInferenceAt >= INFERENCE_INTERVAL_MS) {
        lastInferenceAt = now;
        const startedAt = performance.now();
        const hits = engine.detectCanvas(canvas).map((hit) => ({
          label: hit.label,
          score: hit.score,
          x: hit.originX,
          y: hit.originY,
          width: hit.width,
          height: hit.height,
        }));
        const nextSnapshot: ObjectDetectorSnapshot = {
          detections: hits,
          inferenceMs: performance.now() - startedAt,
          updatedAt: now,
        };
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
      }

      window.setTimeout(tick, INFERENCE_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [options.enabled, options.isLive, options.getCanvasElement]);

  return {
    snapshot,
    isLoading,
    errorMessage,
  };
}
