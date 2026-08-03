import { describe, expect, it } from "vitest";

import {
  MEDIAPIPE_TASKS_VISION_VERSION,
  MEDIAPIPE_WASM_BASE,
} from "./mediapipeWasmBase";

describe("mediapipeWasmBase", () => {
  it("pins wasm CDN to the installed tasks-vision version", () => {
    expect(MEDIAPIPE_WASM_BASE).toBe(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`,
    );
    expect(MEDIAPIPE_WASM_BASE).not.toContain("/tasks-vision/wasm");
  });
});
