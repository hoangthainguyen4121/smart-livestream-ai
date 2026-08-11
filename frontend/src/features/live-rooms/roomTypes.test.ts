import { describe, expect, it } from "vitest";

import shared from "../../../../shared/live_room_taxonomy.json";
import {
  DEFAULT_ROOM_TYPE,
  getRoomTypeLabel,
  isLiveRoomType,
  LIVE_ROOM_TYPES,
} from "./roomTypes";

describe("roomTypes taxonomy", () => {
  it("matches the shared canonical taxonomy ids", () => {
    expect(DEFAULT_ROOM_TYPE).toBe(shared.default_id);
    expect([...LIVE_ROOM_TYPES].sort()).toEqual(
      shared.categories.map((category) => category.id).sort(),
    );
  });

  it("keeps legacy ids valid", () => {
    for (const id of ["fashion", "beauty", "food", "electronics", "general"]) {
      expect(isLiveRoomType(id)).toBe(true);
    }
  });

  it("accepts new taxonomy ids", () => {
    expect(isLiveRoomType("home_living")).toBe(true);
    expect(isLiveRoomType("mom_baby")).toBe(true);
    expect(isLiveRoomType("sports")).toBe(true);
  });

  it("falls back safely for unknown legacy values", () => {
    expect(getRoomTypeLabel("legacy_unknown", "vi")).toBe("Tổng hợp");
    expect(getRoomTypeLabel("legacy_unknown", "en")).toBe("General");
  });
});
