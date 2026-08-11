import { describe, expect, it } from "vitest";

import { shouldFallbackPaint } from "./paintSchedule";

describe("shouldFallbackPaint", () => {
  it("paints when no prior paint exists", () => {
    expect(shouldFallbackPaint(1000, 0, 66)).toBe(true);
  });

  it("skips when paint is still fresh", () => {
    expect(shouldFallbackPaint(1000, 950, 66)).toBe(false);
  });

  it("paints when rAF appears stalled", () => {
    expect(shouldFallbackPaint(1000, 900, 66)).toBe(true);
  });
});
