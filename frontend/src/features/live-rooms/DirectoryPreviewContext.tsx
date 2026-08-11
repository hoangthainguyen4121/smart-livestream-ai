import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { LiveRoom } from "../../api/liveSessions";
import { selectPreviewRoomIds } from "./selectPreviewRoomIds";

type DirectoryPreviewContextValue = {
  previewRoomIds: Set<string>;
  setRoomVisible: (roomId: string, visible: boolean) => void;
  setHoveredRoomId: (roomId: string | null) => void;
};

const DirectoryPreviewContext = createContext<DirectoryPreviewContextValue | null>(null);

export function DirectoryPreviewProvider({
  rooms,
  children,
}: {
  rooms: LiveRoom[];
  children: ReactNode;
}) {
  const [visibleRoomIds, setVisibleRoomIds] = useState<string[]>([]);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);

  const setRoomVisible = useCallback((roomId: string, visible: boolean) => {
    setVisibleRoomIds((current) => {
      const exists = current.includes(roomId);
      if (visible && !exists) {
        return [...current, roomId];
      }
      if (!visible && exists) {
        return current.filter((id) => id !== roomId);
      }
      return current;
    });
  }, []);

  const mediaLiveRoomIds = useMemo(
    () => rooms.filter((room) => room.media_live).map((room) => room.room_id),
    [rooms],
  );

  const previewRoomIds = useMemo(
    () =>
      new Set(
        selectPreviewRoomIds({
          mediaLiveRoomIds,
          visibleRoomIds,
          hoveredRoomId,
        }),
      ),
    [hoveredRoomId, mediaLiveRoomIds, visibleRoomIds],
  );

  const value = useMemo(
    () => ({
      previewRoomIds,
      setRoomVisible,
      setHoveredRoomId,
    }),
    [previewRoomIds, setRoomVisible],
  );

  return (
    <DirectoryPreviewContext.Provider value={value}>{children}</DirectoryPreviewContext.Provider>
  );
}

export function useDirectoryPreview(): DirectoryPreviewContextValue {
  const value = useContext(DirectoryPreviewContext);
  if (!value) {
    throw new Error("useDirectoryPreview must be used within DirectoryPreviewProvider");
  }
  return value;
}
