import { describe, expect, it } from "vitest";

import {
  resolveMediaIdlePlaceholder,
  resolveMediaStatusPresentation,
  resolveRoomSessionBadge,
} from "./roomPresentation";

describe("roomPresentation", () => {
  it("keeps active room badge even when media is idle", () => {
    expect(resolveRoomSessionBadge("active")).toEqual({
      labelKey: "roomSessionActive",
      className: "liveBadge",
    });
    expect(resolveMediaStatusPresentation("stopped").labelKey).toBe("mediaStatusIdle");
  });

  it("shows ended badge only for ended session", () => {
    expect(resolveRoomSessionBadge("ended").labelKey).toBe("roomSessionEnded");
  });

  it("uses host/viewer idle placeholders", () => {
    expect(resolveMediaIdlePlaceholder(true)).toBe("mediaIdlePlaceholderHost");
    expect(resolveMediaIdlePlaceholder(false)).toBe("mediaIdlePlaceholderViewer");
  });
});
