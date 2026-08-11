import type { LiveRoom } from "../../api/liveSessions";
import type { LiveRoomTypeFilter } from "./roomTypes";

export function filterLiveRooms(
  rooms: LiveRoom[],
  options: { query: string; roomType: LiveRoomTypeFilter },
): LiveRoom[] {
  const query = options.query.trim().toLowerCase();
  return rooms.filter((room) => {
    if (options.roomType !== "all" && room.room_type !== options.roomType) {
      return false;
    }
    if (!query) {
      return true;
    }
    return room.name.toLowerCase().includes(query) || room.room_id.toLowerCase().includes(query);
  });
}
