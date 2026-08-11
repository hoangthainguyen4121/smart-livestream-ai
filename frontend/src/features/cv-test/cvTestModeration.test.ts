import { describe, expect, it } from "vitest";

import { buildWouldTerminateEvent, formatSimulatedEvent } from "./cvTestModeration";

describe("cvTestModeration", () => {
  it("builds WOULD_TERMINATE without ending a session", () => {
    const event = buildWouldTerminateEvent({
      label: "knife",
      confidence: 0.88,
      evidenceCount: 3,
      windowMs: 5000,
    });
    expect(event.code).toBe("WOULD_TERMINATE");
    expect(event.detail).toContain("sharp_object_detected");
    expect(formatSimulatedEvent(event)).toContain("WOULD_TERMINATE");
  });
});
