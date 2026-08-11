import { describe, expect, it } from "vitest";

import type { ObjectDetectorHit } from "./objectDetectorTypes";
import {
  evaluateVisualModeration,
  filterScoredDetections,
  nextLastProductSeenAtMs,
} from "./visualModerationPolicy";

function hit(label: string, score = 0.9): ObjectDetectorHit {
  return { label, score, x: 0, y: 0, width: 10, height: 10 };
}

describe("evaluateVisualModeration", () => {
  it("returns safe when detection is inactive", () => {
    const result = evaluateVisualModeration({
      detections: [hit("knife")],
      isActive: false,
      nowMs: 10_000,
      lastProductSeenAtMs: null,
      cameraActiveSinceMs: null,
    });
    expect(result).toEqual({ status: "safe", findings: [] });
  });

  it("emits sharp-object warning for knife/scissors only", () => {
    const result = evaluateVisualModeration({
      detections: [hit("knife"), hit("bottle")],
      isActive: true,
      nowMs: 10_000,
      lastProductSeenAtMs: 9_500,
      cameraActiveSinceMs: 0,
    });
    expect(result.status).toBe("warning");
    expect(result.findings.map((f) => f.code)).toContain("sharp_object");
    expect(result.findings.find((f) => f.code === "sharp_object")?.matchedLabels).toEqual([
      "knife",
    ]);
  });

  it("does not treat baseball bat as sharp-object in MVP rules", () => {
    const result = evaluateVisualModeration({
      detections: [hit("baseball bat"), hit("bottle")],
      isActive: true,
      nowMs: 10_000,
      lastProductSeenAtMs: 9_500,
      cameraActiveSinceMs: 0,
    });
    expect(result.findings.map((f) => f.code)).not.toContain("sharp_object");
  });

  it("emits crowd warning when person count >= 4", () => {
    const result = evaluateVisualModeration({
      detections: [hit("person"), hit("person"), hit("person"), hit("person"), hit("cup")],
      isActive: true,
      nowMs: 10_000,
      lastProductSeenAtMs: 9_500,
      cameraActiveSinceMs: 0,
    });
    const crowd = result.findings.find((f) => f.code === "crowd");
    expect(crowd?.personCount).toBe(4);
  });

  it("does not emit crowd warning below threshold", () => {
    const result = evaluateVisualModeration({
      detections: [hit("person"), hit("person"), hit("person"), hit("cup")],
      isActive: true,
      nowMs: 10_000,
      lastProductSeenAtMs: 9_500,
      cameraActiveSinceMs: 0,
    });
    expect(result.findings.map((f) => f.code)).not.toContain("crowd");
  });

  it("waits for product-absence grace period before warning", () => {
    const early = evaluateVisualModeration({
      detections: [hit("person")],
      isActive: true,
      nowMs: 3_000,
      lastProductSeenAtMs: null,
      cameraActiveSinceMs: 0,
      productAbsenceGraceMs: 5_000,
    });
    expect(early.findings.map((f) => f.code)).not.toContain("product_absence");

    const late = evaluateVisualModeration({
      detections: [hit("person")],
      isActive: true,
      nowMs: 6_000,
      lastProductSeenAtMs: null,
      cameraActiveSinceMs: 0,
      productAbsenceGraceMs: 5_000,
    });
    expect(late.findings.map((f) => f.code)).toContain("product_absence");
  });

  it("clears product-absence when allowlist product is visible", () => {
    const result = evaluateVisualModeration({
      detections: [hit("bottle")],
      isActive: true,
      nowMs: 20_000,
      lastProductSeenAtMs: 1_000,
      cameraActiveSinceMs: 0,
      productAbsenceGraceMs: 5_000,
    });
    expect(result.findings.map((f) => f.code)).not.toContain("product_absence");
    expect(result.status).toBe("safe");
  });
});

describe("nextLastProductSeenAtMs", () => {
  it("updates timestamp when a demo product is detected", () => {
    expect(
      nextLastProductSeenAtMs({
        detections: [hit("cup")],
        nowMs: 123,
        previousMs: 10,
      }),
    ).toBe(123);
  });

  it("keeps previous timestamp when no product is visible", () => {
    expect(
      nextLastProductSeenAtMs({
        detections: [hit("person")],
        nowMs: 123,
        previousMs: 10,
      }),
    ).toBe(10);
  });
});

describe("filterScoredDetections", () => {
  it("keeps non-product COCO labels needed for moderation", () => {
    const filtered = filterScoredDetections([
      hit("knife", 0.8),
      hit("person", 0.7),
      hit("bottle", 0.6),
      hit("noise", 0.2),
    ]);
    expect(filtered.map((entry) => entry.label)).toEqual(["knife", "person", "bottle"]);
  });
});
