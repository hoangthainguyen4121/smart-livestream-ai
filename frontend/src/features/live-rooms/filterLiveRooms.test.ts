import { describe, expect, it } from "vitest";

import type { LiveRoom } from "../../api/liveSessions";
import { filterLiveRooms } from "./filterLiveRooms";

const rooms: LiveRoom[] = [
  {
    id: "1",
    room_id: "fashion-1",
    name: "Fashion Live",
    room_type: "fashion",
    status: "active",
    started_at: "2026-08-08T00:00:00Z",
    ended_at: null,
    metadata: {},
  },
  {
    id: "2",
    room_id: "food-1",
    name: "Street Food",
    room_type: "food",
    status: "active",
    started_at: "2026-08-08T00:00:00Z",
    ended_at: null,
    metadata: {},
  },
];

describe("filterLiveRooms", () => {
  it("filters by room type", () => {
    expect(filterLiveRooms(rooms, { query: "", roomType: "fashion" })).toHaveLength(1);
  });

  it("does not crash when rooms contain unknown legacy types", () => {
    const withLegacy = [
      ...rooms,
      {
        ...rooms[0],
        id: "3",
        room_id: "legacy-1",
        name: "Legacy",
        room_type: "old_custom_type",
      },
    ];
    expect(filterLiveRooms(withLegacy, { query: "", roomType: "all" })).toHaveLength(3);
    expect(filterLiveRooms(withLegacy, { query: "", roomType: "fashion" })).toHaveLength(1);
  });

  it("searches by name case-insensitive", () => {
    expect(filterLiveRooms(rooms, { query: "street", roomType: "all" })[0]?.name).toBe(
      "Street Food",
    );
  });

  it("returns empty when no match", () => {
    expect(filterLiveRooms(rooms, { query: "zzz", roomType: "all" })).toEqual([]);
  });
});
