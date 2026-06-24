from __future__ import annotations

import cv2
import numpy as np

from config.settings import OVERLAY
from desktop_client.pipeline.display_compositor import LetterboxLayout, letterbox_frame, map_bbox
from desktop_client.pipeline.face_tracker import TrackerSnapshot, bbox_label_anchor
from desktop_client.pipeline.frame_timing import FrameTimingSnapshot
from desktop_client.pipeline.livestream_state import (
    ActionBadge,
    EventFeedEntry,
    StreamTimer,
    ViewState,
)
from utils.geometry import BoundingBox


PILL_HEIGHT = 34
PILL_PADDING_X = 14
EVENT_PANEL_WIDTH = 250
TOP_BAR_HEIGHT = 56


class LivestreamRenderer:
    def __init__(
        self,
        *,
        canvas_width: int = 1280,
        canvas_height: int = 720,
        host_handle: str = "@hoang",
        viewer_count: int = 128,
        stream_title: str = "AI Livestream Demo",
    ) -> None:
        self.canvas_width = canvas_width
        self.canvas_height = canvas_height
        self.default_host_handle = host_handle
        self.viewer_count = viewer_count
        self.stream_title = stream_title
        self._label_positions: dict[str, tuple[float, float]] = {}
        self._stream_timer = StreamTimer()

    def draw_runtime_view(
        self,
        frame: np.ndarray,
        layout: LetterboxLayout,
        tracker_snapshot: TrackerSnapshot,
        view_state: ViewState,
        *,
        event_feed: list[EventFeedEntry],
        action_badges: list[ActionBadge],
        display_fps: float,
        recognition_fps: float = 0.0,
        frame_timing: FrameTimingSnapshot | None = None,
        host_handle: str | None = None,
    ) -> np.ndarray:
        canvas = letterbox_frame(frame, layout)
        host_tag = host_handle or self.default_host_handle

        if tracker_snapshot.bbox is not None and tracker_snapshot.label is not None:
            display_bbox = map_bbox(tracker_snapshot.bbox, layout)
            anchor = bbox_label_anchor(display_bbox)
            smooth_x, smooth_y = self._smooth_label_position(tracker_snapshot.label, anchor)
            self._draw_floating_label(
                canvas,
                smooth_x,
                smooth_y,
                tracker_snapshot.label,
                tracker_snapshot.is_known,
            )

            if view_state.show_bbox:
                color = (80, 220, 80) if tracker_snapshot.is_known else (80, 180, 255)
                self._draw_box(canvas, display_bbox, color)

        if view_state.debug_overlay and tracker_snapshot.recognition_bbox is not None:
            recognition_bbox = map_bbox(tracker_snapshot.recognition_bbox, layout)
            self._draw_box(canvas, recognition_bbox, (80, 80, 255), thickness=1)

        self._draw_top_chrome(canvas, host_tag)
        self._draw_host_tag(canvas, host_tag)
        if view_state.show_event_feed:
            self._draw_event_feed_panel(canvas, event_feed)
        self._draw_action_badges(canvas, action_badges)

        if view_state.debug_overlay:
            self._draw_debug_stats(
                canvas,
                tracker_snapshot,
                display_fps,
                recognition_fps,
                frame_timing,
            )

        return canvas

    def _draw_top_chrome(self, canvas: np.ndarray, host_handle: str) -> None:
        self._fill_translucent_rect(canvas, 0, 0, self.canvas_width, TOP_BAR_HEIGHT, alpha=0.55)

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(
            canvas,
            self.stream_title,
            (24, 36),
            font,
            0.85,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

        live_x = 360
        self._draw_pill(canvas, live_x, 16, 74, 28, (40, 40, 220), "LIVE", 0.58, (255, 255, 255))

        viewers_text = f"{self.viewer_count} viewers"
        cv2.putText(
            canvas,
            viewers_text,
            (live_x + 92, 36),
            font,
            0.62,
            (220, 230, 240),
            2,
            cv2.LINE_AA,
        )

        timer_text = self._stream_timer.elapsed_text()
        timer_size, _ = cv2.getTextSize(timer_text, font, 0.62, 2)
        timer_x = self.canvas_width - timer_size[0] - 28
        cv2.putText(
            canvas,
            timer_text,
            (timer_x, 36),
            font,
            0.62,
            (220, 230, 240),
            2,
            cv2.LINE_AA,
        )

    def _draw_host_tag(self, canvas: np.ndarray, host_handle: str) -> None:
        y = self.canvas_height - 28
        self._draw_pill(
            canvas,
            24,
            y - 30,
            max(120, len(host_handle) * 14 + 28),
            34,
            (28, 36, 48),
            host_handle,
            0.72,
            (255, 255, 255),
        )

    def _draw_event_feed_panel(self, canvas: np.ndarray, event_feed: list[EventFeedEntry]) -> None:
        panel_x = self.canvas_width - EVENT_PANEL_WIDTH - 18
        panel_y = TOP_BAR_HEIGHT + 18
        panel_height = min(260, self.canvas_height - panel_y - 24)
        self._fill_translucent_rect(
            canvas,
            panel_x,
            panel_y,
            EVENT_PANEL_WIDTH,
            panel_height,
            alpha=0.62,
        )

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(
            canvas,
            "AI Event Feed",
            (panel_x + 14, panel_y + 24),
            font,
            0.58,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

        line_y = panel_y + 48
        for entry in event_feed[:6]:
            cv2.putText(
                canvas,
                entry.message[:28],
                (panel_x + 14, line_y),
                font,
                0.46,
                (210, 220, 235),
                1,
                cv2.LINE_AA,
            )
            line_y += 24
            if line_y > panel_y + panel_height - 8:
                break

        if not event_feed:
            cv2.putText(
                canvas,
                "Waiting for AI events...",
                (panel_x + 14, panel_y + 52),
                font,
                0.44,
                (150, 160, 175),
                1,
                cv2.LINE_AA,
            )

    def _draw_action_badges(self, canvas: np.ndarray, action_badges: list[ActionBadge]) -> None:
        if not action_badges:
            return

        badge = action_badges[0]
        progress = badge.frames_left / max(1, 45)
        alpha = min(1.0, max(0.35, progress))
        center_x = self.canvas_width // 2
        center_y = self.canvas_height // 2 + 40
        badge_width = 360
        badge_height = 92
        x1 = center_x - badge_width // 2
        y1 = center_y - badge_height // 2

        accent = (180, 210, 60) if badge.label == "THUMBS UP" else (255, 180, 80)
        self._fill_translucent_rect(
            canvas,
            x1,
            y1,
            badge_width,
            badge_height,
            color=(20, 24, 32),
            alpha=0.72 * alpha,
        )
        cv2.rectangle(canvas, (x1, y1), (x1 + badge_width, y1 + badge_height), accent, 2)

        font = cv2.FONT_HERSHEY_SIMPLEX
        icon_x = x1 + 28
        cv2.circle(canvas, (icon_x, center_y), 22, accent, 2)
        cv2.putText(
            canvas,
            badge.subtitle,
            (icon_x - 12, center_y + 8),
            font,
            0.7,
            accent,
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            badge.label,
            (x1 + 72, center_y + 10),
            font,
            1.05,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    def _draw_debug_stats(
        self,
        canvas: np.ndarray,
        snapshot: TrackerSnapshot,
        display_fps: float,
        recognition_fps: float,
        frame_timing: FrameTimingSnapshot | None,
    ) -> None:
        y = OVERLAY.fps_position[1] + TOP_BAR_HEIGHT
        font = cv2.FONT_HERSHEY_SIMPLEX
        color = (0, 255, 255)
        cv2.putText(
            canvas,
            f"Display {display_fps:.1f} FPS | Recog {recognition_fps:.1f} FPS",
            (OVERLAY.fps_position[0], y),
            font,
            0.58,
            color,
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            (
                f"Tracker {snapshot.tracker_name} {snapshot.status.upper()} | "
                f"Track {snapshot.tracker_fps:.1f} FPS | {snapshot.tracker_update_ms:.1f} ms"
            ),
            (OVERLAY.fps_position[0], y + 22),
            font,
            0.52,
            color,
            2,
            cv2.LINE_AA,
        )
        if frame_timing is not None:
            cv2.putText(
                canvas,
                (
                    f"cam {frame_timing.camera_ms:.1f} | trk {frame_timing.tracker_ms:.1f} | "
                    f"draw {frame_timing.draw_ms:.1f} | show {frame_timing.imshow_ms:.1f} | "
                    f"total {frame_timing.total_frame_ms:.1f} ms"
                ),
                (OVERLAY.fps_position[0], y + 44),
                font,
                0.48,
                color,
                1,
                cv2.LINE_AA,
            )
            cv2.putText(
                canvas,
                (
                    f"capture {frame_timing.frame_width}x{frame_timing.frame_height} | "
                    f"canvas {self.canvas_width}x{self.canvas_height} | "
                    f"{snapshot.tracker_impl}"
                ),
                (OVERLAY.fps_position[0], y + 64),
                font,
                0.48,
                color,
                1,
                cv2.LINE_AA,
            )
            detail_y = y + 84
        else:
            detail_y = y + 44

        controls = "Q quit | D debug | G gestures | B bbox | F fullscreen"
        cv2.putText(
            canvas,
            controls,
            (OVERLAY.fps_position[0], detail_y),
            font,
            0.44,
            color,
            1,
            cv2.LINE_AA,
        )

    def _smooth_label_position(
        self,
        label: str,
        anchor: tuple[int, int],
    ) -> tuple[int, int]:
        previous = self._label_positions.get(label)
        if previous is None:
            self._label_positions[label] = (float(anchor[0]), float(anchor[1]))
            return anchor

        alpha = 0.88
        x = previous[0] + (anchor[0] - previous[0]) * alpha
        y = previous[1] + (anchor[1] - previous[1]) * alpha
        distance = ((anchor[0] - x) ** 2 + (anchor[1] - y) ** 2) ** 0.5
        if distance > 120:
            x, y = float(anchor[0]), float(anchor[1])

        self._label_positions[label] = (x, y)
        return int(x), int(y)

    def _draw_floating_label(
        self,
        canvas: np.ndarray,
        center_x: int,
        anchor_y: int,
        label: str,
        is_known: bool,
    ) -> None:
        height, width = canvas.shape[:2]
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.62
        thickness = 2
        (text_width, text_height), _ = cv2.getTextSize(label, font, font_scale, thickness)
        pill_width = text_width + PILL_PADDING_X * 2
        pill_x = max(12, min(center_x - pill_width // 2, width - pill_width - 12))
        pill_y = max(TOP_BAR_HEIGHT + 8, min(anchor_y - PILL_HEIGHT, height - PILL_HEIGHT - 12))

        bg_color = (36, 58, 92) if is_known else (48, 48, 58)
        self._draw_pill(
            canvas,
            pill_x,
            pill_y,
            pill_width,
            PILL_HEIGHT,
            bg_color,
            label,
            font_scale,
            (255, 255, 255) if is_known else (210, 225, 255),
            thickness=thickness,
        )

    def _draw_pill(
        self,
        canvas: np.ndarray,
        x: int,
        y: int,
        width: int,
        height: int,
        bg_color: tuple[int, int, int],
        text: str,
        font_scale: float,
        text_color: tuple[int, int, int],
        thickness: int = 2,
    ) -> None:
        self._fill_translucent_rect(canvas, x, y, width, height, color=bg_color, alpha=0.82)
        font = cv2.FONT_HERSHEY_SIMPLEX
        (text_width, text_height), _ = cv2.getTextSize(text, font, font_scale, thickness)
        text_x = x + max(PILL_PADDING_X, (width - text_width) // 2)
        text_y = y + (height + text_height) // 2 - 2
        cv2.putText(
            canvas,
            text,
            (text_x, text_y),
            font,
            font_scale,
            text_color,
            thickness,
            cv2.LINE_AA,
        )

    @staticmethod
    def _draw_box(
        canvas: np.ndarray,
        bbox: BoundingBox,
        color: tuple[int, int, int],
        thickness: int = 2,
    ) -> None:
        cv2.rectangle(canvas, (bbox.x1, bbox.y1), (bbox.x2, bbox.y2), color, thickness)

    @staticmethod
    def _fill_translucent_rect(
        canvas: np.ndarray,
        x: int,
        y: int,
        width: int,
        height: int,
        *,
        color: tuple[int, int, int] = (18, 16, 14),
        alpha: float = 0.55,
    ) -> None:
        x1 = max(0, x)
        y1 = max(0, y)
        x2 = min(canvas.shape[1], x + width)
        y2 = min(canvas.shape[0], y + height)
        if x2 <= x1 or y2 <= y1:
            return

        roi = canvas[y1:y2, x1:x2]
        overlay = roi.copy()
        overlay[:] = color
        cv2.addWeighted(overlay, alpha, roi, 1.0 - alpha, 0, roi)


LabelRenderer = LivestreamRenderer
