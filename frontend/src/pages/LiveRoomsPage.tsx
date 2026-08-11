import { useCallback, useEffect, useMemo, useState } from "react";

import { createLiveRoom, listActiveLiveRooms, type LiveRoom } from "../api/liveSessions";
import { filterLiveRooms } from "../features/live-rooms/filterLiveRooms";
import { markRoomAsHosted } from "../features/live-rooms/hostedRooms";
import { saveHostResumeToken } from "../features/live-rooms/hostResumeToken";
import { DirectoryPreviewProvider } from "../features/live-rooms/DirectoryPreviewContext";
import { RoomCardPreview } from "../features/live-rooms/RoomCardPreview";
import {
  DEFAULT_ROOM_TYPE,
  getRoomTypeLabel,
  LIVE_ROOM_CATEGORIES,
  type LiveRoomType,
  type LiveRoomTypeFilter,
} from "../features/live-rooms/roomTypes";
import { useI18n } from "../i18n/I18nProvider";
import { liveRoomPath, navigateHash } from "../routing/hashRoute";

const POLL_MS = 12_000;

export function LiveRoomsPage() {
  const { t, locale } = useI18n();
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomType, setRoomType] = useState<LiveRoomTypeFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<LiveRoomType>(DEFAULT_ROOM_TYPE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    setError(null);
    try {
      const next = await listActiveLiveRooms();
      setRooms(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("roomsLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "hidden") {
        return;
      }
      timer = window.setInterval(() => {
        void loadRooms();
      }, POLL_MS);
    };

    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadRooms();
      }
      schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadRooms]);

  const filteredRooms = useMemo(
    () => filterLiveRooms(rooms, { query, roomType }),
    [rooms, query, roomType],
  );

  async function handleCreateRoom() {
    const name = createName.trim();
    if (!name) {
      setCreateError(t("roomsCreateNameRequired"));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const room = await createLiveRoom({ name, room_type: createType });
      if (room.host_resume_token) {
        saveHostResumeToken(room.room_id, room.host_resume_token, room.id);
      }
      markRoomAsHosted(room.room_id);
      setCreateOpen(false);
      setCreateName("");
      navigateHash(liveRoomPath(room.room_id));
    } catch (createErr) {
      setCreateError(createErr instanceof Error ? createErr.message : t("roomsCreateError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page liveRoomsPage">
      <header className="liveRoomsHeader">
        <div>
          <p className="eyebrow">{t("appEyebrow")}</p>
          <h1>{t("roomsTitle")}</h1>
          <p className="liveRoomsSubtitle">{t("roomsSubtitle")}</p>
          <p className="liveRoomsCount">
            {t("roomsActiveCount", { count: loading ? "…" : rooms.length })}
          </p>
        </div>
        <div className="liveRoomsHeaderActions">
          <button type="button" className="liveRoomsRefreshButton" onClick={() => void loadRooms()}>
            {t("roomsRefresh")}
          </button>
          <button
            type="button"
            className="liveRoomsCreateButton"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            {t("roomsCreate")}
          </button>
        </div>
      </header>

      <section className="liveRoomsFilters" aria-label={t("roomsFiltersLabel")}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("roomsSearchPlaceholder")}
          className="liveRoomsSearch"
        />
        <select
          value={roomType}
          onChange={(event) => setRoomType(event.target.value as LiveRoomTypeFilter)}
          className="liveRoomsTypeSelect"
          aria-label={t("roomsTypeFilter")}
        >
          <option value="all">{t("roomTypeAll")}</option>
          {LIVE_ROOM_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {getRoomTypeLabel(category.id, locale)}
            </option>
          ))}
        </select>
      </section>

      {loading ? (
        <div className="liveRoomsGrid" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="liveRoomCard liveRoomCardSkeleton" />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="liveRoomsState error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadRooms()}>
            {t("roomsRetry")}
          </button>
        </div>
      ) : null}

      {!loading && !error && rooms.length === 0 ? (
        <div className="liveRoomsState">
          <p>{t("roomsEmpty")}</p>
          <button
            type="button"
            className="liveRoomsCreateButton"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            {t("roomsCreateFirst")}
          </button>
        </div>
      ) : null}

      {!loading && !error && rooms.length > 0 && filteredRooms.length === 0 ? (
        <div className="liveRoomsState">
          <p>{t("roomsFilteredEmpty")}</p>
        </div>
      ) : null}

      {!loading && !error && filteredRooms.length > 0 ? (
        <DirectoryPreviewProvider rooms={filteredRooms}>
          <div className="liveRoomsGrid">
            {filteredRooms.map((room) => (
              <article key={room.id} className="liveRoomCard">
                <RoomCardPreview room={room} />
                <div className="liveRoomCardBody">
                  <h2>{room.name}</h2>
                  <div className="liveRoomCardMeta">
                    <span className="liveRoomTypeChip">
                      {getRoomTypeLabel(room.room_type, locale)}
                    </span>
                  </div>
                  <p className="liveRoomCardTime">
                    {t("roomsStartedAt", {
                      time: new Date(room.started_at).toLocaleString(locale === "vi" ? "vi-VN" : "en-US"),
                    })}
                  </p>
                  <button
                    type="button"
                    className="liveRoomJoinButton"
                    onClick={() => navigateHash(liveRoomPath(room.room_id))}
                  >
                    {t("roomsJoin")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </DirectoryPreviewProvider>
      ) : null}

      {createOpen ? (
        <div
          className="liveRoomsModalBackdrop"
          role="presentation"
          onClick={() => {
            if (!creating) {
              setCreateOpen(false);
            }
          }}
        >
          <div
            className="liveRoomsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="create-room-title">{t("roomsCreateTitle")}</h2>
            <label className="liveRoomsModalField">
              <span>{t("roomsCreateName")}</span>
              <input
                value={createName}
                maxLength={80}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t("roomsCreateNamePlaceholder")}
                autoFocus
              />
            </label>
            <label className="liveRoomsModalField">
              <span>{t("roomsCreateType")}</span>
              <select
                value={createType}
                onChange={(event) => setCreateType(event.target.value as LiveRoomType)}
              >
                {LIVE_ROOM_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getRoomTypeLabel(category.id, locale)}
                  </option>
                ))}
              </select>
            </label>
            {createError ? <div className="error">{createError}</div> : null}
            <div className="liveRoomsModalActions">
              <button
                type="button"
                className="liveRoomsCancelButton"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                {t("roomsCreateCancel")}
              </button>
              <button
                type="button"
                className="liveRoomsCreateButton"
                disabled={creating}
                onClick={() => void handleCreateRoom()}
              >
                {creating ? t("roomsCreating") : t("roomsCreateSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
