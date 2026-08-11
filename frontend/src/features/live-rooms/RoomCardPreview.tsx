import { useEffect, useRef } from "react";

import type { LiveRoom } from "../../api/liveSessions";
import { useI18n } from "../../i18n/I18nProvider";
import { RemoteLiveVideo } from "../webrtc/RemoteLiveVideo";
import { useViewerWebRtcPlayer } from "../webrtc/useViewerWebRtcPlayer";
import { useDirectoryPreview } from "./DirectoryPreviewContext";

type RoomCardPreviewProps = {
  room: LiveRoom;
};

function createPreviewPeerId(roomId: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `preview-${roomId}-${suffix}`;
}

/** Directory card preview: WebRTC viewer only when slot-selected (visible/hover, max 3). */
export function RoomCardPreview({ room }: RoomCardPreviewProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const peerIdRef = useRef(createPreviewPeerId(room.room_id));
  const { previewRoomIds, setRoomVisible, setHoveredRoomId } = useDirectoryPreview();
  const shouldConnect = previewRoomIds.has(room.room_id);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setRoomVisible(room.room_id, true);
      return () => setRoomVisible(room.room_id, false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setRoomVisible(room.room_id, Boolean(entry?.isIntersecting));
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setRoomVisible(room.room_id, false);
    };
  }, [room.room_id, setRoomVisible]);

  const preview = useViewerWebRtcPlayer({
    roomId: room.room_id,
    enabled: shouldConnect,
    peerId: peerIdRef.current,
  });

  const placeholder = room.host_recoverable
    ? t("roomsPreviewHostAway")
    : room.media_live
      ? t("roomsPreviewConnecting")
      : t("roomsPreviewWaiting");

  return (
    <div
      ref={rootRef}
      className="liveRoomCardPreview"
      aria-hidden="true"
      onMouseEnter={() => setHoveredRoomId(room.room_id)}
      onMouseLeave={() => setHoveredRoomId(null)}
      onFocus={() => setHoveredRoomId(room.room_id)}
      onBlur={() => setHoveredRoomId(null)}
    >
      {shouldConnect && preview.remoteStream ? (
        <RemoteLiveVideo stream={preview.remoteStream} className="liveRoomCardPreviewMedia" />
      ) : (
        <div className="liveRoomCardPreviewIdle">
          <span className="liveRoomCardPreviewIdleLabel">{placeholder}</span>
        </div>
      )}
      <span className="liveRoomCardLivePill">
        <span className="liveRoomCardLiveDot" />
        {room.host_recoverable ? t("roomsRecoverableBadge") : t("roomsLiveBadge")}
      </span>
    </div>
  );
}
