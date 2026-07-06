import { useCameraProductRecognition } from "../camera-product-recognition/useCameraProductRecognition";
import { isCameraProductRecognitionEnabled, isHandHeldVisionEnabled } from "../../config/featureFlags";
import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import type { CameraProductDetectionState, CameraProductMatch } from "../camera-product-recognition/types";
import { useHandHeldProductRecognition } from "./useHandHeldProductRecognition";
import type { HandVisionDebugSnapshot } from "./handVisionDebugTypes";
import { EMPTY_HAND_VISION_DEBUG_SNAPSHOT } from "./handVisionDebugTypes";

type UseProductVisionRecognitionOptions = {
  isLive: boolean;
  catalog: CatalogProduct[];
  captureFrame: () => ImageData | null;
  getVideoElement: () => HTMLVideoElement | null;
};

type ProductVisionDetectionState = CameraProductDetectionState & {
  handDetected?: boolean;
  holdsObject?: boolean;
  embedder?: "clip" | "fingerprint" | null;
  mode: "hand_held_embedding" | "legacy_dhash" | "disabled";
};

type UseProductVisionRecognitionResult = {
  featureEnabled: boolean;
  detection: ProductVisionDetectionState;
  activeVisionProductId: string | null;
  debugSnapshot: HandVisionDebugSnapshot;
  recognizeNow: () => Promise<CameraProductMatch | null>;
  applyDetectionAsContext: () => void;
  clearVisionContext: () => void;
};

export function useProductVisionRecognition(
  options: UseProductVisionRecognitionOptions,
): UseProductVisionRecognitionResult {
  const handHeldEnabled = isHandHeldVisionEnabled();
  const legacyEnabled = isCameraProductRecognitionEnabled() && !handHeldEnabled;

  const handHeld = useHandHeldProductRecognition({
    enabled: handHeldEnabled,
    isLive: options.isLive,
    catalog: options.catalog,
    captureFrame: options.captureFrame,
    getVideoElement: options.getVideoElement,
  });

  const legacy = useCameraProductRecognition({
    enabled: legacyEnabled,
    isLive: options.isLive,
    catalog: options.catalog,
    captureFrame: options.captureFrame,
  });

  if (handHeldEnabled) {
    return {
      featureEnabled: handHeld.featureEnabled,
      detection: {
        ...handHeld.detection,
        mode: "hand_held_embedding",
      },
      activeVisionProductId: handHeld.activeVisionProductId,
      debugSnapshot: handHeld.debugSnapshot,
      recognizeNow: handHeld.recognizeNow,
      applyDetectionAsContext: handHeld.applyDetectionAsContext,
      clearVisionContext: handHeld.clearVisionContext,
    };
  }

  if (legacyEnabled) {
    return {
      featureEnabled: legacy.featureEnabled,
      detection: {
        ...legacy.detection,
        mode: "legacy_dhash",
      },
      activeVisionProductId: legacy.activeVisionProductId,
      debugSnapshot: EMPTY_HAND_VISION_DEBUG_SNAPSHOT,
      recognizeNow: legacy.recognizeNow,
      applyDetectionAsContext: legacy.applyDetectionAsContext,
      clearVisionContext: legacy.clearVisionContext,
    };
  }

  return {
    featureEnabled: false,
    detection: {
      match: null,
      isRunning: false,
      lastError: null,
      lastRecognizedAt: null,
      mode: "disabled",
    },
    activeVisionProductId: null,
    debugSnapshot: EMPTY_HAND_VISION_DEBUG_SNAPSHOT,
    recognizeNow: async () => null,
    applyDetectionAsContext: () => undefined,
    clearVisionContext: () => undefined,
  };
}
