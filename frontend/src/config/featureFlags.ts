function parseBooleanFlag(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isCameraProductRecognitionEnabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION, false);
}

export function isHandHeldVisionEnabled(): boolean {
  return parseBooleanFlag(import.meta.env.VITE_ENABLE_HAND_HELD_VISION, false);
}
