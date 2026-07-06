import { describe, expect, it } from "vitest";

import {
  computeHandCropRect,
  cropImageData,
  mirrorNormalizedLandmarks,
  pickPrimaryHand,
} from "./handRoi";
import { createSyntheticImageData } from "../camera-product-recognition/catalogImageMatcher";

describe("handRoi", () => {
  it("mirrors normalized x coordinates for selfie frames", () => {
    const mirrored = mirrorNormalizedLandmarks([
      { x: 0.2, y: 0.5, z: 0 },
      { x: 0.8, y: 0.6, z: 0 },
    ]);
    expect(mirrored[0]?.x).toBeCloseTo(0.8);
    expect(mirrored[1]?.x).toBeCloseTo(0.2);
  });

  it("computes a bounded crop rect from hand landmarks", () => {
    const landmarks = Array.from({ length: 21 }, (_, index) => ({
      x: 0.4 + (index % 5) * 0.02,
      y: 0.4 + Math.floor(index / 5) * 0.02,
      z: 0,
    }));

    const rect = computeHandCropRect(landmarks, 640, 480);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(640);
    expect(rect.y + rect.height).toBeLessThanOrEqual(480);
  });

  it("returns null when no hand is present", () => {
    expect(pickPrimaryHand([])).toBeNull();
  });

  it("crops image data to the requested rectangle", () => {
    const frame = createSyntheticImageData(255, 0, 0, 4, 4);

    const cropped = cropImageData(frame, { x: 1, y: 1, width: 2, height: 2 });
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(cropped.data[0]).toBe(255);
  });
});
