export const DIRECTORY_PREVIEW_MAX = 3;

/**
 * Pick up to N rooms for directory WebRTC preview.
 * Hovered room wins a slot first; remaining slots go to visible media-live rooms.
 */
export function selectPreviewRoomIds(options: {
  mediaLiveRoomIds: readonly string[];
  visibleRoomIds: readonly string[];
  hoveredRoomId: string | null;
  maxPreviews?: number;
}): string[] {
  const max = options.maxPreviews ?? DIRECTORY_PREVIEW_MAX;
  const mediaLive = new Set(options.mediaLiveRoomIds);
  const selected: string[] = [];

  const push = (roomId: string | null | undefined) => {
    if (!roomId || !mediaLive.has(roomId) || selected.includes(roomId)) {
      return;
    }
    if (selected.length >= max) {
      return;
    }
    selected.push(roomId);
  };

  push(options.hoveredRoomId);
  for (const roomId of options.visibleRoomIds) {
    push(roomId);
  }
  return selected;
}
