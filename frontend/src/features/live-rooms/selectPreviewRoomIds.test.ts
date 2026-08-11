import { describe, expect, it } from "vitest";

import { selectPreviewRoomIds } from "./selectPreviewRoomIds";

describe("selectPreviewRoomIds", () => {
  it("caps concurrent previews at 3", () => {
    const selected = selectPreviewRoomIds({
      mediaLiveRoomIds: ["a", "b", "c", "d"],
      visibleRoomIds: ["a", "b", "c", "d"],
      hoveredRoomId: null,
      maxPreviews: 3,
    });
    expect(selected).toEqual(["a", "b", "c"]);
  });

  it("prioritizes hovered room", () => {
    const selected = selectPreviewRoomIds({
      mediaLiveRoomIds: ["a", "b", "c", "d"],
      visibleRoomIds: ["a", "b", "c"],
      hoveredRoomId: "d",
      maxPreviews: 3,
    });
    expect(selected[0]).toBe("d");
    expect(selected).toHaveLength(3);
  });

  it("ignores rooms without media", () => {
    const selected = selectPreviewRoomIds({
      mediaLiveRoomIds: ["b"],
      visibleRoomIds: ["a", "b", "c"],
      hoveredRoomId: "a",
    });
    expect(selected).toEqual(["b"]);
  });
});
