from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable

import cv2
import numpy as np

from face_recognition.recognizer import RecognitionResult
from utils.fps_monitor import FPSMonitor
from utils.geometry import BoundingBox


logger = logging.getLogger(__name__)

TRACKER_LOST_GRACE_MS = 800
IDENTITY_GRACE_MS = 2500
MIN_RECOGNITION_CONFIDENCE = 0.45
MIN_TRACKER_BOX_SIZE = 11
LABEL_OFFSET_Y = 16


@dataclass(frozen=True)
class TrackerSnapshot:
    bbox: BoundingBox | None
    recognition_bbox: BoundingBox | None
    label: str | None
    is_known: bool
    similarity: float | None
    status: str
    tracker_name: str
    tracker_impl: str
    tracker_fps: float
    tracker_update_ms: float
    last_recognition_age_ms: float
    init_rect: tuple[int, int, int, int] | None = None
    status_detail: str = ""


class FaceTrackerController:
    def __init__(self, tracker_name: str = "kcf") -> None:
        normalized = tracker_name.strip().lower()
        if normalized not in {"kcf", "csrt", "none", "mosse"}:
            raise ValueError(f"Unsupported tracker: {tracker_name}")
        self.tracker_name = normalized
        self._opencv_tracker = None
        self._active_tracker_impl = "none"
        self._bbox: BoundingBox | None = None
        self._recognition_bbox: BoundingBox | None = None
        self._last_init_rect: tuple[int, int, int, int] | None = None
        self._status_detail = ""
        self._username: str | None = None
        self._similarity: float | None = None
        self._status = "idle"
        self._last_recognition_at = 0.0
        self._last_identity_at = 0.0
        self._lost_at: float | None = None
        self._tracker_fps = FPSMonitor(window_size=30)
        self._last_tracker_update_ms = 0.0

    def apply_recognition(
        self,
        frame: np.ndarray,
        results: list[RecognitionResult],
        now: float | None = None,
    ) -> None:
        current_time = time.perf_counter() if now is None else now
        self._last_recognition_at = current_time

        primary = pick_primary_face(results)
        if primary is None:
            self._recognition_bbox = None
            self._status_detail = "No face in recognition result"
            return

        self._recognition_bbox = primary.bbox
        if (
            primary.is_known
            and primary.similarity is not None
            and primary.similarity >= MIN_RECOGNITION_CONFIDENCE
        ):
            self._username = primary.label
            self._similarity = primary.similarity
            self._last_identity_at = current_time

        if self.tracker_name == "none":
            self._bbox = primary.bbox
            self._status = "recognition_only"
            self._status_detail = "Tracker disabled"
            return

        self._status = "initializing"
        self._status_detail = "Initializing tracker from recognition bbox"
        if self._init_tracker(frame, primary.bbox):
            self._status = "tracking"
            self._lost_at = None
        else:
            self._status = "init_failed"
            self._opencv_tracker = None

    def update(self, frame: np.ndarray, now: float | None = None) -> TrackerSnapshot:
        current_time = time.perf_counter() if now is None else now
        started_at = current_time

        if self.tracker_name != "none" and self._opencv_tracker is not None:
            ok, rect = self._opencv_tracker.update(frame)
            self._tracker_fps.update()
            if ok:
                self._bbox = rect_to_bbox(rect, frame.shape[1], frame.shape[0])
                self._status = "tracking"
                self._status_detail = f"Tracking via {self._active_tracker_impl}"
                self._lost_at = None
            else:
                if self._lost_at is None:
                    self._lost_at = current_time
                if current_time - self._lost_at <= TRACKER_LOST_GRACE_MS:
                    self._status = "grace"
                    self._status_detail = "Tracker update failed, holding last bbox"
                else:
                    self._status = "lost"
                    self._status_detail = "Tracker lost, waiting for recognition"
                    self._opencv_tracker = None

        self._last_tracker_update_ms = max(0.0, (time.perf_counter() - started_at) * 1000.0)
        return self._build_snapshot(current_time)

    def _init_tracker(self, frame: np.ndarray, bbox: BoundingBox) -> bool:
        frame_height, frame_width = frame.shape[:2]
        init_rect = normalize_tracker_rect(
            bbox,
            frame_width=frame_width,
            frame_height=frame_height,
            min_size=MIN_TRACKER_BOX_SIZE,
        )
        if init_rect is None:
            self._status_detail = (
                f"Invalid init bbox source=({bbox.x1},{bbox.y1},{bbox.x2},{bbox.y2}) "
                f"frame={frame_width}x{frame_height}"
            )
            logger.warning("Tracker init skipped: %s", self._status_detail)
            return False

        x, y, width, height = init_rect
        logger.info(
            "Tracker init attempt preferred=%s rect=(x=%s y=%s w=%s h=%s) frame=%sx%s",
            self.tracker_name,
            x,
            y,
            width,
            height,
            frame_width,
            frame_height,
        )

        for tracker_kind, factory_name, factory in iter_tracker_fallback_chain(self.tracker_name):
            try:
                tracker = factory()
            except Exception as error:
                logger.warning("Tracker create failed kind=%s path=%s error=%s", tracker_kind, factory_name, error)
                continue

            init_result = tracker.init(frame, init_rect)
            init_ok = tracker_init_succeeded(init_result)
            logger.info(
                "Tracker init result kind=%s path=%s returned=%r interpreted=%s rect=%s",
                tracker_kind,
                factory_name,
                init_result,
                init_ok,
                init_rect,
            )
            if not init_ok:
                continue

            self._opencv_tracker = tracker
            self._active_tracker_impl = factory_name
            self._last_init_rect = init_rect
            self._bbox = rect_to_bbox(init_rect, frame_width, frame_height)
            self._status_detail = f"Initialized via {factory_name}"
            return True

        self._status_detail = f"All tracker backends failed for rect={init_rect}"
        logger.warning("Tracker init failed: %s", self._status_detail)
        return False

    def _build_snapshot(self, now: float) -> TrackerSnapshot:
        label, is_known = resolve_tracker_label(
            username=self._username,
            similarity=self._similarity,
            status=self._status,
            has_bbox=self._bbox is not None,
            now=now,
            last_identity_at=self._last_identity_at,
        )
        recognition_age_ms = (
            max(0.0, (now - self._last_recognition_at) * 1000.0)
            if self._last_recognition_at > 0
            else 0.0
        )
        return TrackerSnapshot(
            bbox=self._bbox,
            recognition_bbox=self._recognition_bbox,
            label=label,
            is_known=is_known,
            similarity=self._similarity,
            status=self._status,
            tracker_name=self.tracker_name,
            tracker_impl=self._active_tracker_impl,
            tracker_fps=self._tracker_fps.average_fps,
            tracker_update_ms=self._last_tracker_update_ms,
            last_recognition_age_ms=recognition_age_ms,
            init_rect=self._last_init_rect,
            status_detail=self._status_detail,
        )


def log_opencv_tracker_capabilities() -> None:
    logger.info("OpenCV version: %s", cv2.__version__)
    tracker_apis = [
        "TrackerKCF_create",
        "TrackerCSRT_create",
        "TrackerMOSSE_create",
        "TrackerMIL_create",
        "TrackerBoosting_create",
    ]
    for api_name in tracker_apis:
        main_available = hasattr(cv2, api_name)
        legacy_available = hasattr(cv2, "legacy") and hasattr(cv2.legacy, api_name)
        logger.info(
            "OpenCV tracker API %s: cv2=%s legacy=%s",
            api_name,
            main_available,
            legacy_available,
        )


def tracker_init_succeeded(init_result: object) -> bool:
    if init_result is False:
        return False
    if init_result is True or init_result is None:
        return True
    return bool(init_result)


def normalize_tracker_rect(
    bbox: BoundingBox,
    *,
    frame_width: int,
    frame_height: int,
    min_size: int = MIN_TRACKER_BOX_SIZE,
) -> tuple[int, int, int, int] | None:
    if frame_width <= 0 or frame_height <= 0:
        return None

    x1 = max(0, min(bbox.x1, frame_width - 1))
    y1 = max(0, min(bbox.y1, frame_height - 1))
    x2 = max(x1 + 1, min(bbox.x2, frame_width))
    y2 = max(y1 + 1, min(bbox.y2, frame_height))

    width = x2 - x1
    height = y2 - y1
    if width <= min_size or height <= min_size:
        return None
    if x1 + width > frame_width or y1 + height > frame_height:
        return None

    return (x1, y1, width, height)


def iter_tracker_fallback_chain(preferred: str):
    order = []
    preferred = preferred.lower()
    if preferred == "kcf":
        order = ["kcf", "csrt", "mosse"]
    elif preferred == "csrt":
        order = ["csrt", "kcf", "mosse"]
    elif preferred == "mosse":
        order = ["mosse", "kcf", "csrt"]
    else:
        order = ["kcf", "csrt", "mosse"]

    seen: set[str] = set()
    for kind in order:
        if kind in seen:
            continue
        seen.add(kind)
        for factory_name, factory in tracker_factories_for_kind(kind):
            yield kind, factory_name, factory


def tracker_factories_for_kind(kind: str) -> list[tuple[str, Callable[[], object]]]:
    api_name = {
        "kcf": "TrackerKCF_create",
        "csrt": "TrackerCSRT_create",
        "mosse": "TrackerMOSSE_create",
    }.get(kind)
    if api_name is None:
        return []

    factories: list[tuple[str, Callable[[], object]]] = []
    if hasattr(cv2, "legacy") and hasattr(cv2.legacy, api_name):
        legacy_name = f"cv2.legacy.{api_name}"
        factories.append((legacy_name, lambda api=api_name: getattr(cv2.legacy, api)()))
    if hasattr(cv2, api_name):
        main_name = f"cv2.{api_name}"
        factories.append((main_name, lambda api=api_name: getattr(cv2, api)()))
    return factories


def resolve_tracker_label(
    *,
    username: str | None,
    similarity: float | None,
    status: str,
    has_bbox: bool,
    now: float,
    last_identity_at: float,
) -> tuple[str | None, bool]:
    if not has_bbox or status == "lost":
        return None, False

    has_recent_identity = (
        username is not None and last_identity_at > 0 and (now - last_identity_at) <= IDENTITY_GRACE_MS
    )
    if has_recent_identity:
        return username, True
    if status in {"tracking", "grace", "recognition_only", "init_failed", "initializing"}:
        return "Detecting...", False
    return None, False


def rect_to_bbox(rect, frame_width: int, frame_height: int) -> BoundingBox:
    if len(rect) == 4 and not isinstance(rect, BoundingBox):
        x, y, width, height = [int(round(value)) for value in rect]
        bbox = BoundingBox(x, y, x + max(1, width), y + max(1, height))
    else:
        raise ValueError(f"Unsupported rect format: {rect!r}")
    return bbox.clamp(frame_width, frame_height)


def bbox_label_anchor(bbox: BoundingBox) -> tuple[int, int]:
    center_x = (bbox.x1 + bbox.x2) // 2
    anchor_y = max(0, bbox.y1 - LABEL_OFFSET_Y)
    return center_x, anchor_y


def pick_primary_face(
    recognition_results: list[RecognitionResult],
) -> RecognitionResult | None:
    if not recognition_results:
        return None

    known_faces = [result for result in recognition_results if result.is_known]
    candidates = known_faces or recognition_results
    return max(candidates, key=lambda result: result.bbox.area)
