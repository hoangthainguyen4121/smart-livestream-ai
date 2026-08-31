import taxonomy from "../../../../shared/live_room_taxonomy.json";

export type LiveRoomCategory = {
  id: string;
  sort_order: number;
  label_vi: string;
  label_en: string;
  icon_key?: string;
  commerce_required: boolean;
};

export const DEFAULT_ROOM_TYPE = taxonomy.default_id;

export const LIVE_ROOM_CATEGORIES: LiveRoomCategory[] = [...taxonomy.categories].sort(
  (left, right) => left.sort_order - right.sort_order,
);

/** Stable persisted category ids from the shared taxonomy contract. */
export const LIVE_ROOM_TYPES = LIVE_ROOM_CATEGORIES.map((category) => category.id);

export type LiveRoomType = (typeof LIVE_ROOM_TYPES)[number];

export type LiveRoomTypeFilter = "all" | LiveRoomType;

export function isLiveRoomType(value: string): value is LiveRoomType {
  return LIVE_ROOM_TYPES.includes(value);
}

export function roomTypeRequiresCommerce(roomType: string): boolean {
  return LIVE_ROOM_CATEGORIES.find((category) => category.id === roomType)?.commerce_required ?? false;
}

/** UI label from canonical taxonomy; unknown/legacy ids fall back to general. */
export function getRoomTypeLabel(roomType: string, locale: "vi" | "en"): string {
  const normalized = roomType.trim().toLowerCase();
  const match =
    LIVE_ROOM_CATEGORIES.find((category) => category.id === normalized) ??
    LIVE_ROOM_CATEGORIES.find((category) => category.id === DEFAULT_ROOM_TYPE);
  if (!match) {
    return locale === "vi" ? "Tổng hợp" : "General";
  }
  return locale === "vi" ? match.label_vi : match.label_en;
}
