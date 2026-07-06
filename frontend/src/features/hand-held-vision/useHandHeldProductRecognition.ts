import { useCallback, useEffect, useRef, useState } from "react";

import { isHandHeldVisionEnabled } from "../../config/featureFlags";
import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { CameraProductDetectionState, CameraProductMatch } from "../camera-product-recognition/types";
import {
  AUTO_APPLY_CAMERA_VISION_CONFIDENCE,
  CAMERA_RECOGNITION_INTERVAL_MS,
} from "../camera-product-recognition/types";
import { rasterizeCatalogForVision } from "./catalogRasterizer";
import { HandLandmarkerEngine } from "./handLandmarkerEngine";
import {
  computeHandCropRect,
  cropImageData,
  imageDataToPngBase64,
  mirrorNormalizedLandmarks,
  pickPrimaryHand,
} from "./handRoi";
import {
  fetchProductVisionStatus,
  matchHandCropEmbedding,
  syncCatalogEmbeddings,
  type ProductVisionStatus,
} from "./productVisionApi";
import {
  EMPTY_HAND_VISION_DEBUG_SNAPSHOT,
  type HandVisionDebugSnapshot,
} from "./handVisionDebugTypes";
import { estimateObjectInHandCrop } from "./handRoiObjectHeuristic";

type UseHandHeldProductRecognitionOptions = {
  enabled?: boolean;
  isLive: boolean;
  catalog: CatalogProduct[];
  captureFrame: () => ImageData | null;
  getVideoElement: () => HTMLVideoElement | null;
  intervalMs?: number;
};

type UseHandHeldProductRecognitionResult = {
  featureEnabled: boolean;
  detection: CameraProductDetectionState & {
    handDetected: boolean;
    holdsObject: boolean;
    embedder: ProductVisionStatus["embedder"] | null;
    initPhase: "idle" | "loading" | "ready" | "error";
  };
  activeVisionProductId: string | null;
  debugSnapshot: HandVisionDebugSnapshot;
  recognizeNow: () => Promise<CameraProductMatch | null>;
  applyDetectionAsContext: () => void;
  clearVisionContext: () => void;
};

const INITIAL_DETECTION: CameraProductDetectionState & {
  handDetected: boolean;
  holdsObject: boolean;
  embedder: ProductVisionStatus["embedder"] | null;
  initPhase: "idle" | "loading" | "ready" | "error";
} = {
  match: null,
  isRunning: false,
  lastError: null,
  lastRecognizedAt: null,
  handDetected: false,
  holdsObject: false,
  embedder: null,
  initPhase: "idle",
};

export function useHandHeldProductRecognition(
  options: UseHandHeldProductRecognitionOptions,
): UseHandHeldProductRecognitionResult {
  const featureEnabled = options.enabled ?? isHandHeldVisionEnabled();
  const intervalMs = options.intervalMs ?? CAMERA_RECOGNITION_INTERVAL_MS;
  const [detection, setDetection] = useState(INITIAL_DETECTION);
  const [activeVisionProductId, setActiveVisionProductId] = useState<string | null>(null);
  const [debugSnapshot, setDebugSnapshot] = useState<HandVisionDebugSnapshot>(
    EMPTY_HAND_VISION_DEBUG_SNAPSHOT,
  );
  const handEngineRef = useRef<HandLandmarkerEngine | null>(null);
  const catalogReadyRef = useRef(false);
  const handReadyRef = useRef(false);
  const visionStatusRef = useRef<ProductVisionStatus | null>(null);

  useEffect(() => {
    if (!featureEnabled) {
      handEngineRef.current?.close();
      handEngineRef.current = null;
      catalogReadyRef.current = false;
      handReadyRef.current = false;
      visionStatusRef.current = null;
      setDetection(INITIAL_DETECTION);
      setDebugSnapshot(EMPTY_HAND_VISION_DEBUG_SNAPSHOT);
      return;
    }

    let cancelled = false;

    setDetection((current) => ({
      ...current,
      initPhase: "loading",
      lastError: "Đang tải hand model và đồng bộ catalog...",
    }));

    void (async () => {
      const status = await fetchProductVisionStatus();
      if (cancelled) {
        return;
      }
      if (!status?.enabled) {
        setDetection((current) => ({
          ...current,
          initPhase: "error",
          lastError: "Backend hand-held vision is disabled. Set HAND_HELD_VISION_ENABLED=true.",
        }));
        return;
      }

      visionStatusRef.current = status;

      const rasterItems = await rasterizeCatalogForVision(options.catalog);
      if (rasterItems.length === 0) {
        setDetection((current) => ({
          ...current,
          initPhase: "error",
          lastError:
            "Không tải được ảnh catalog. Chạy: npx tsx scripts/generate-catalog-images.ts rồi refresh trang.",
        }));
        return;
      }

      const synced = await syncCatalogEmbeddings(rasterItems);
      if (cancelled) {
        return;
      }
      if (!synced || synced.catalogIndexed === 0) {
        setDetection((current) => ({
          ...current,
          initPhase: "error",
          lastError: "Backend không index được catalog embeddings.",
        }));
        return;
      }

      catalogReadyRef.current = true;
      visionStatusRef.current = synced;

      const engine = new HandLandmarkerEngine();
      await engine.init();
      if (cancelled) {
        engine.close();
        return;
      }

      handEngineRef.current = engine;
      handReadyRef.current = true;

      setDetection((current) => ({
        ...current,
        initPhase: "ready",
        embedder: synced.embedder,
        lastError: null,
      }));
    })().catch((error) => {
      setDetection((current) => ({
        ...current,
        initPhase: "error",
        lastError: error instanceof Error ? error.message : "Unable to initialize hand-held vision.",
      }));
    });

    return () => {
      cancelled = true;
      handEngineRef.current?.close();
      handEngineRef.current = null;
      catalogReadyRef.current = false;
      handReadyRef.current = false;
    };
  }, [featureEnabled, options.catalog]);

  const recognizeNow = useCallback(async (): Promise<CameraProductMatch | null> => {
    if (!featureEnabled) {
      return null;
    }

    if (!catalogReadyRef.current || !handReadyRef.current) {
      return null;
    }

    const frame = options.captureFrame();
    const engine = handEngineRef.current;

    if (!frame || !engine) {
      setDetection((current) => ({
        ...current,
        lastError: "Camera or hand model unavailable.",
        handDetected: false,
      }));
      return null;
    }

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = frame.width;
    frameCanvas.height = frame.height;
    const frameContext = frameCanvas.getContext("2d");
    if (!frameContext) {
      return null;
    }
    frameContext.putImageData(frame, 0, 0);

    setDetection((current) => ({
      ...current,
      isRunning: true,
    }));

    const handResult = engine.detectImage(frameCanvas);
    const primaryHand = pickPrimaryHand(handResult?.hands ?? []);

    if (!primaryHand) {
      setDebugSnapshot({
        ...EMPTY_HAND_VISION_DEBUG_SNAPSHOT,
        handDetected: false,
        status: "no_hand",
        updatedAt: new Date().toISOString(),
      });
      setDetection((current) => ({
        ...current,
        match: null,
        isRunning: false,
        lastError: null,
        lastRecognizedAt: new Date().toISOString(),
        handDetected: false,
        holdsObject: false,
        embedder: visionStatusRef.current?.embedder ?? current.embedder,
        initPhase: "ready",
      }));
      return null;
    }

    const mirroredLandmarks = mirrorNormalizedLandmarks(primaryHand);
    const cropRect = computeHandCropRect(mirroredLandmarks, frame.width, frame.height);
    const crop = cropImageData(frame, cropRect);
    const cropBase64 = imageDataToPngBase64(crop);
    const landmarkPoints = mirroredLandmarks.map((point) => ({
      x: point.x * frame.width,
      y: point.y * frame.height,
    }));

    const objectPresence = estimateObjectInHandCrop(crop);

    if (!objectPresence.hasObject) {
      setDebugSnapshot({
        handDetected: true,
        holdsObject: false,
        objectScore: objectPresence.objectScore,
        cropRect,
        landmarks: landmarkPoints,
        productId: null,
        productName: null,
        confidence: null,
        score: null,
        status: "empty_hand",
        cropPreviewDataUrl: cropBase64,
        updatedAt: new Date().toISOString(),
      });
      setDetection((current) => ({
        ...current,
        match: null,
        isRunning: false,
        lastError: null,
        lastRecognizedAt: new Date().toISOString(),
        handDetected: true,
        holdsObject: false,
        embedder: visionStatusRef.current?.embedder ?? current.embedder,
        initPhase: "ready",
      }));
      return null;
    }

    try {
      const apiMatch = await matchHandCropEmbedding(cropBase64);
      const match: CameraProductMatch | null = apiMatch
        ? {
            productId: apiMatch.productId,
            productName: apiMatch.productName,
            score: apiMatch.score,
            confidence: apiMatch.confidence,
            source: "camera_vision",
            explanation: apiMatch.explanation,
          }
        : null;

      setDebugSnapshot({
        handDetected: true,
        holdsObject: true,
        objectScore: objectPresence.objectScore,
        cropRect,
        landmarks: landmarkPoints,
        productId: match?.productId ?? null,
        productName: match?.productName ?? null,
        confidence: match?.confidence ?? null,
        score: match?.score ?? null,
        status: match ? "matched" : "no_match",
        cropPreviewDataUrl: cropBase64,
        updatedAt: new Date().toISOString(),
      });

      setDetection((current) => ({
        ...current,
        match,
        isRunning: false,
        lastError: match ? null : "No confident catalog match in hand region.",
        lastRecognizedAt: new Date().toISOString(),
        handDetected: true,
        holdsObject: true,
        embedder: apiMatch?.embedder ?? visionStatusRef.current?.embedder ?? current.embedder,
        initPhase: "ready",
      }));

      if (match && match.confidence >= AUTO_APPLY_CAMERA_VISION_CONFIDENCE) {
        setActiveVisionProductId(match.productId);
      }

      return match;
    } catch (error) {
      setDebugSnapshot({
        handDetected: true,
        holdsObject: true,
        objectScore: objectPresence.objectScore,
        cropRect,
        landmarks: landmarkPoints,
        productId: null,
        productName: null,
        confidence: null,
        score: null,
        status: "no_match",
        cropPreviewDataUrl: cropBase64,
        updatedAt: new Date().toISOString(),
      });
      setDetection((current) => ({
        ...current,
        match: null,
        isRunning: false,
        lastError: error instanceof Error ? error.message : "Hand-held vision request failed.",
        lastRecognizedAt: new Date().toISOString(),
        handDetected: true,
        holdsObject: true,
        embedder: visionStatusRef.current?.embedder ?? current.embedder,
        initPhase: "ready",
      }));
      return null;
    }
  }, [featureEnabled, options.captureFrame]);

  useEffect(() => {
    if (!featureEnabled || !options.isLive || detection.initPhase !== "ready") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void recognizeNow();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [detection.initPhase, featureEnabled, intervalMs, options.isLive, recognizeNow]);

  const applyDetectionAsContext = useCallback(() => {
    if (detection.match) {
      setActiveVisionProductId(detection.match.productId);
    }
  }, [detection.match]);

  const clearVisionContext = useCallback(() => {
    setActiveVisionProductId(null);
    setDetection((current) => ({
      ...INITIAL_DETECTION,
      initPhase: current.initPhase,
      embedder: current.embedder,
    }));
    setDebugSnapshot(EMPTY_HAND_VISION_DEBUG_SNAPSHOT);
  }, []);

  return {
    featureEnabled,
    detection,
    activeVisionProductId,
    debugSnapshot,
    recognizeNow,
    applyDetectionAsContext,
    clearVisionContext,
  };
}
