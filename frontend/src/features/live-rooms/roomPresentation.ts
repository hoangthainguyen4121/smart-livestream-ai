import type { StreamDisplayStatus } from "../browser-ar/runtime/videoCaptureSource";
import type { TranslationKey } from "../../i18n/translations";

export type RoomSessionUi = "active" | "ended";

export type RoomBadgePresentation = {
  labelKey: TranslationKey;
  className: "liveBadge" | "offlineBadge" | "endedBadge";
};

export type MediaStatusPresentation = {
  labelKey: TranslationKey;
};

/** Session badge must not depend on local camera/media state. */
export function resolveRoomSessionBadge(session: RoomSessionUi): RoomBadgePresentation {
  if (session === "ended") {
    return { labelKey: "roomSessionEnded", className: "endedBadge" };
  }
  return { labelKey: "roomSessionActive", className: "liveBadge" };
}

/** Media chip is separate from room lifecycle. */
export function resolveMediaStatusPresentation(
  mediaStatus: StreamDisplayStatus,
): MediaStatusPresentation {
  if (mediaStatus === "camera") {
    return { labelKey: "streamStatusCamera" };
  }
  if (mediaStatus === "screen") {
    return { labelKey: "streamStatusScreen" };
  }
  return { labelKey: "mediaStatusIdle" };
}

export function resolveMediaIdlePlaceholder(isHost: boolean): TranslationKey {
  return isHost ? "mediaIdlePlaceholderHost" : "mediaIdlePlaceholderViewer";
}
