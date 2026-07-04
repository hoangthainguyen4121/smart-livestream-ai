import { afterEach, describe, expect, it, vi } from "vitest";

import { isCameraProductRecognitionEnabled } from "../../config/featureFlags";
import {
  computeImageSignature,
  compareImageSignatures,
} from "./imageSignature";
import {
  createSyntheticImageData,
  matchFrameAgainstCatalog,
} from "./catalogImageMatcher";
import type { CatalogImageSignature } from "./types";

describe("isCameraProductRecognitionEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to disabled unless VITE flag is true", () => {
    vi.stubEnv("VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION", "");
    expect(isCameraProductRecognitionEnabled()).toBe(false);
  });
});

describe("catalog image matcher", () => {
  it("matches similar synthetic frames and ignores low-confidence matches", () => {
    const redFrame = computeImageSignature(createSyntheticImageData(220, 20, 20));
    const catalogSignatures: CatalogImageSignature[] = [
      {
        productId: "bucket-hat",
        productName: "Mũ bucket",
        imageUrl: "/products/images/bucket-hat.svg",
        signature: computeImageSignature(createSyntheticImageData(210, 25, 25)),
      },
      {
        productId: "lipstick-ruby",
        productName: "Son Ruby Đỏ",
        imageUrl: "/products/images/lipstick-ruby.svg",
        signature: computeImageSignature(createSyntheticImageData(20, 20, 180)),
      },
    ];

    const match = matchFrameAgainstCatalog(redFrame, catalogSignatures, 0.55);
    expect(match?.productId).toBe("bucket-hat");
    expect(match?.source).toBe("camera_vision");
    expect(match?.confidence).toBeGreaterThan(0.55);

    const unrelated = computeImageSignature(createSyntheticImageData(10, 180, 240));
    const lowConfidence = matchFrameAgainstCatalog(unrelated, catalogSignatures, 0.95);
    expect(lowConfidence).toBeNull();
  });
});

describe("compareImageSignatures", () => {
  it("returns higher score for similar signatures", () => {
    const left = computeImageSignature(createSyntheticImageData(100, 120, 140));
    const similar = computeImageSignature(createSyntheticImageData(102, 118, 138));
    const different = computeImageSignature(createSyntheticImageData(20, 220, 40));

    expect(compareImageSignatures(left, similar)).toBeGreaterThan(
      compareImageSignatures(left, different),
    );
  });
});
