import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_DETECTIONS,
  DEFAULT_SCORE_THRESHOLD,
  filterProductDetections,
  mapDetectionBoxToOverlay,
  resolveProductDetectionStatus,
  shouldAcceptDetectionEpoch,
  shouldRunProductDetection,
} from "./productDetectionPolicy";
import type { ObjectDetectorHit } from "./objectDetectorTypes";

function hit(partial: Partial<ObjectDetectorHit> & Pick<ObjectDetectorHit, "label" | "score">): ObjectDetectorHit {
  return {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...partial,
  };
}

describe("shouldRunProductDetection", () => {
  it("runs for enabled live camera", () => {
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "camera" }),
    ).toBe(true);
  });

  it("runs for enabled live file harness", () => {
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "file" }),
    ).toBe(true);
  });

  it("does not run when toggle is off", () => {
    expect(
      shouldRunProductDetection({ enabled: false, isLive: true, videoSource: "camera" }),
    ).toBe(false);
  });

  it("pauses on screen share", () => {
    expect(
      shouldRunProductDetection({ enabled: true, isLive: true, videoSource: "screen" }),
    ).toBe(false);
  });

  it("stops when stream is stopped", () => {
    expect(
      shouldRunProductDetection({ enabled: true, isLive: false, videoSource: "camera" }),
    ).toBe(false);
  });
});

describe("resolveProductDetectionStatus", () => {
  it("reports off / loading / error / paused / empty / detecting", () => {
    expect(
      resolveProductDetectionStatus({
        enabled: false,
        isLive: true,
        videoSource: "camera",
        isLoading: false,
        errorMessage: null,
        detectionCount: 0,
      }),
    ).toBe("off");

    expect(
      resolveProductDetectionStatus({
        enabled: true,
        isLive: true,
        videoSource: "camera",
        isLoading: true,
        errorMessage: null,
        detectionCount: 0,
      }),
    ).toBe("loading");

    expect(
      resolveProductDetectionStatus({
        enabled: true,
        isLive: true,
        videoSource: "camera",
        isLoading: false,
        errorMessage: "fail",
        detectionCount: 0,
      }),
    ).toBe("error");

    expect(
      resolveProductDetectionStatus({
        enabled: true,
        isLive: true,
        videoSource: "screen",
        isLoading: false,
        errorMessage: null,
        detectionCount: 0,
      }),
    ).toBe("paused");

    expect(
      resolveProductDetectionStatus({
        enabled: true,
        isLive: true,
        videoSource: "camera",
        isLoading: false,
        errorMessage: null,
        detectionCount: 0,
      }),
    ).toBe("empty");

    expect(
      resolveProductDetectionStatus({
        enabled: true,
        isLive: true,
        videoSource: "camera",
        isLoading: false,
        errorMessage: null,
        detectionCount: 2,
      }),
    ).toBe("detecting");
  });
});

describe("filterProductDetections", () => {
  it("applies confidence threshold", () => {
    const filtered = filterProductDetections(
      [hit({ label: "bottle", score: 0.49 }), hit({ label: "cup", score: 0.51 })],
      { scoreThreshold: DEFAULT_SCORE_THRESHOLD },
    );
    expect(filtered.map((entry) => entry.label)).toEqual(["cup"]);
  });

  it("keeps only demo product labels", () => {
    const filtered = filterProductDetections([
      hit({ label: "person", score: 0.99 }),
      hit({ label: "bottle", score: 0.8 }),
      hit({ label: "cell phone", score: 0.7 }),
    ]);
    expect(filtered.map((entry) => entry.label)).toEqual(["bottle", "cell phone"]);
  });

  it("limits max detections", () => {
    const filtered = filterProductDetections(
      [
        hit({ label: "bottle", score: 0.9 }),
        hit({ label: "cup", score: 0.8 }),
        hit({ label: "book", score: 0.7 }),
      ],
      { maxDetections: 2 },
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0]?.label).toBe("bottle");
  });

  it("defaults max detections to 10", () => {
    const hits = Array.from({ length: 12 }, (_, index) =>
      hit({ label: "bottle", score: 0.9 - index * 0.01 }),
    );
    expect(filterProductDetections(hits)).toHaveLength(DEFAULT_MAX_DETECTIONS);
  });
});

describe("mapDetectionBoxToOverlay", () => {
  it("scales boxes without extra mirroring (camera already mirrored upstream)", () => {
    const mapped = mapDetectionBoxToOverlay(
      hit({ label: "bottle", score: 0.9, x: 100, y: 50, width: 40, height: 80 }),
      640,
      480,
      320,
      240,
    );
    expect(mapped.x).toBe(50);
    expect(mapped.y).toBe(25);
    expect(mapped.width).toBe(20);
    expect(mapped.height).toBe(40);
  });

  it("keeps coordinates stable when source and overlay sizes match", () => {
    const mapped = mapDetectionBoxToOverlay(
      hit({ label: "cup", score: 0.9, x: 12, y: 34, width: 56, height: 78 }),
      640,
      480,
      640,
      480,
    );
    expect(mapped).toMatchObject({ x: 12, y: 34, width: 56, height: 78 });
  });
});

describe("shouldAcceptDetectionEpoch", () => {
  it("rejects stale results after source switch", () => {
    expect(shouldAcceptDetectionEpoch(1, 1)).toBe(true);
    expect(shouldAcceptDetectionEpoch(1, 2)).toBe(false);
  });
});
