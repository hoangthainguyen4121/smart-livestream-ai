import { describe, expect, it } from "vitest";

import { createSyntheticImageData } from "../camera-product-recognition/catalogImageMatcher";
import { cropImageData } from "./handRoi";
import { estimateObjectInHandCrop } from "./handRoiObjectHeuristic";

describe("estimateObjectInHandCrop", () => {
  it("treats uniform skin-like palm as empty", () => {
    const frame = createSyntheticImageData(210, 170, 140, 96, 96);
    const crop = cropImageData(frame, { x: 16, y: 16, width: 64, height: 64 });
    const result = estimateObjectInHandCrop(crop);
    expect(result.hasObject).toBe(false);
  });

  it("detects contrasting object blob in palm center", () => {
    const frame = createSyntheticImageData(210, 170, 140, 96, 96);
    for (let row = 30; row < 66; row += 1) {
      for (let column = 30; column < 66; column += 1) {
        const index = (row * 96 + column) * 4;
        frame.data[index] = 20;
        frame.data[index + 1] = 20;
        frame.data[index + 2] = 180;
      }
    }
    const crop = cropImageData(frame, { x: 16, y: 16, width: 64, height: 64 });
    const result = estimateObjectInHandCrop(crop);
    expect(result.hasObject).toBe(true);
  });
});
