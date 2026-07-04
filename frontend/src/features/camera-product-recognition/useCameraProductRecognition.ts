import { useCallback, useEffect, useRef, useState } from "react";

import { isCameraProductRecognitionEnabled } from "../../config/featureFlags";
import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import {
  matchImageDataAgainstCatalogSignatures,
  preloadCatalogImageSignatures,
} from "./catalogImageMatcher";
import type { CameraProductDetectionState, CameraProductMatch } from "./types";
import {
  AUTO_APPLY_CAMERA_VISION_CONFIDENCE,
  CAMERA_RECOGNITION_INTERVAL_MS,
} from "./types";

type UseCameraProductRecognitionOptions = {
  enabled?: boolean;
  isLive: boolean;
  catalog: CatalogProduct[];
  captureFrame: () => ImageData | null;
  intervalMs?: number;
};

type UseCameraProductRecognitionResult = {
  featureEnabled: boolean;
  detection: CameraProductDetectionState;
  activeVisionProductId: string | null;
  recognizeNow: () => Promise<CameraProductMatch | null>;
  applyDetectionAsContext: () => void;
  clearVisionContext: () => void;
};

const INITIAL_DETECTION: CameraProductDetectionState = {
  match: null,
  isRunning: false,
  lastError: null,
  lastRecognizedAt: null,
};

export function useCameraProductRecognition(
  options: UseCameraProductRecognitionOptions,
): UseCameraProductRecognitionResult {
  const featureEnabled = options.enabled ?? isCameraProductRecognitionEnabled();
  const intervalMs = options.intervalMs ?? CAMERA_RECOGNITION_INTERVAL_MS;
  const [detection, setDetection] = useState<CameraProductDetectionState>(INITIAL_DETECTION);
  const [activeVisionProductId, setActiveVisionProductId] = useState<string | null>(null);
  const catalogSignaturesRef = useRef<Awaited<ReturnType<typeof preloadCatalogImageSignatures>>>(
    [],
  );
  const signaturesReadyRef = useRef(false);

  useEffect(() => {
    if (!featureEnabled) {
      catalogSignaturesRef.current = [];
      signaturesReadyRef.current = false;
      return;
    }

    let cancelled = false;
    void preloadCatalogImageSignatures(options.catalog).then((signatures) => {
      if (cancelled) {
        return;
      }
      catalogSignaturesRef.current = signatures;
      signaturesReadyRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [featureEnabled, options.catalog]);

  const recognizeNow = useCallback(async (): Promise<CameraProductMatch | null> => {
    if (!featureEnabled) {
      return null;
    }

    const frame = options.captureFrame();
    if (!frame) {
      setDetection((current) => ({
        ...current,
        lastError: "Camera frame unavailable.",
      }));
      return null;
    }

    if (!signaturesReadyRef.current) {
      catalogSignaturesRef.current = await preloadCatalogImageSignatures(options.catalog);
      signaturesReadyRef.current = true;
    }

    setDetection((current) => ({
      ...current,
      isRunning: true,
      lastError: null,
    }));

    const match = matchImageDataAgainstCatalogSignatures(frame, catalogSignaturesRef.current);
    setDetection({
      match,
      isRunning: false,
      lastError: match ? null : "No confident catalog match in camera frame.",
      lastRecognizedAt: new Date().toISOString(),
    });

    if (match && match.confidence >= AUTO_APPLY_CAMERA_VISION_CONFIDENCE) {
      setActiveVisionProductId(match.productId);
    }

    return match;
  }, [featureEnabled, options.captureFrame, options.catalog]);

  useEffect(() => {
    if (!featureEnabled || !options.isLive) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void recognizeNow();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [featureEnabled, intervalMs, options.isLive, recognizeNow]);

  const applyDetectionAsContext = useCallback(() => {
    if (detection.match) {
      setActiveVisionProductId(detection.match.productId);
    }
  }, [detection.match]);

  const clearVisionContext = useCallback(() => {
    setActiveVisionProductId(null);
    setDetection(INITIAL_DETECTION);
  }, []);

  return {
    featureEnabled,
    detection,
    activeVisionProductId,
    recognizeNow,
    applyDetectionAsContext,
    clearVisionContext,
  };
}
