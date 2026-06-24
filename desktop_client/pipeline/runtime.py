from __future__ import annotations

import logging
import threading
import time

import cv2

from desktop_client.backend_client import BackendClient
from desktop_client.config import DesktopClientSettings
from desktop_client.event_publisher import EventPublisher
from desktop_client.pipeline.camera_reader import DesktopCamera
from desktop_client.pipeline.display_compositor import compute_letterbox
from desktop_client.pipeline.event_dispatch import AsyncEventDispatcher
from desktop_client.pipeline.face_tracker import FaceTrackerController, log_opencv_tracker_capabilities
from desktop_client.pipeline.frame_timing import FrameTimingSmoother, FrameTimingSnapshot
from desktop_client.pipeline.gesture_worker import GestureWorker
from desktop_client.pipeline.livestream_renderer import LivestreamRenderer
from desktop_client.pipeline.livestream_state import (
    ActionFeedbackState,
    EventFeedBuffer,
    ViewState,
    filter_desktop_gesture_events,
    format_host_handle,
    gesture_event_feed_message,
    should_submit_gesture_frame,
)
from desktop_client.pipeline.recognition_worker import RecognitionWorker
from desktop_client.pipeline.window_controls import (
    WINDOW_TITLE,
    handle_view_key,
    setup_display_window,
)
from face_recognition.embedding_store import EmbeddingStore
from face_recognition.recognizer import InsightFaceRecognizer, RecognitionResult
from gesture_detection.gesture_detector import GestureDetector
from utils.fps_monitor import FPSMonitor


logger = logging.getLogger(__name__)


def get_primary_username(recognition_results: list[RecognitionResult]) -> str:
    for result in recognition_results:
        if result.is_known:
            return result.label
    if recognition_results:
        return recognition_results[0].label
    return "Viewer"


def should_submit_recognition(frame_count: int, interval: int) -> bool:
    step = max(1, interval)
    return frame_count == 1 or frame_count % step == 0


class DesktopCameraRuntime:
    def __init__(self, settings: DesktopClientSettings) -> None:
        self.settings = settings
        self.backend_client = BackendClient(
            settings.backend_url,
            settings.client_id,
            timeout_sec=settings.request_timeout_sec,
        )
        self.event_publisher = EventPublisher(
            self.backend_client,
            disappear_grace_sec=settings.identity_disappear_grace_sec,
            batch_interval_sec=settings.event_batch_interval_sec,
        )
        self.renderer = LivestreamRenderer(
            canvas_width=settings.display_width,
            canvas_height=settings.display_height,
            host_handle=settings.host_handle,
            viewer_count=settings.viewer_count,
        )
        self.face_tracker = FaceTrackerController(settings.tracker_name)
        self.view_state = ViewState(
            debug_overlay=settings.debug_overlay,
            show_bbox=settings.debug_overlay,
            gestures_enabled=settings.enable_gestures,
        )
        self.event_feed = EventFeedBuffer()
        self.action_feedback = ActionFeedbackState()
        self._frame_timing = FrameTimingSmoother()
        self._display_timing: FrameTimingSnapshot | None = None
        self._latest_results: list[RecognitionResult] = []
        self._results_lock = threading.Lock()
        self._last_recognition_version = 0
        self._seen_identities: set[str] = set()
        self._gesture_detector: GestureDetector | None = None
        self._gesture_worker: GestureWorker | None = None
        self._gesture_feedback_at: dict[str, float] = {}

    def run(self) -> None:
        log_opencv_tracker_capabilities()
        threading.Thread(target=self._startup_backend_check, daemon=True).start()

        store = EmbeddingStore()
        recognizer = InsightFaceRecognizer(store=store)
        event_dispatcher = AsyncEventDispatcher(self.event_publisher)
        event_dispatcher.start()

        recognition_worker = RecognitionWorker(
            recognizer,
            on_results=event_dispatcher.submit_recognition,
        )
        recognition_worker.start()

        if self.view_state.gestures_enabled:
            self._ensure_gesture_worker(event_dispatcher)

        display_fps_monitor = FPSMonitor()
        setup_display_window(self.settings.display_width, self.settings.display_height, WINDOW_TITLE)
        self.event_feed.push("Stream started")

        try:
            with DesktopCamera(
                index=self.settings.camera_index,
                width=self.settings.camera_width,
                height=self.settings.camera_height,
                max_grab=self.settings.max_camera_grab,
            ) as camera:
                frame_count = 0
                logger.info(
                    "Desktop camera started capture=%sx%s display=%sx%s "
                    "recognition_interval=%s gesture_interval=%s tracker=%s "
                    "gestures=%s debug=%s",
                    self.settings.camera_width,
                    self.settings.camera_height,
                    self.settings.display_width,
                    self.settings.display_height,
                    self.settings.recognition_interval_frames,
                    self.settings.gesture_interval_frames,
                    self.settings.tracker_name,
                    self.view_state.gestures_enabled,
                    self.view_state.debug_overlay,
                )
                logger.info(
                    "Controls: Q/ESC quit | D debug | G gestures | B bbox | F fullscreen"
                )

                while True:
                    frame_started_at = time.perf_counter()

                    camera_started_at = time.perf_counter()
                    frame = camera.read_latest()
                    camera_ms = (time.perf_counter() - camera_started_at) * 1000.0

                    frame_count += 1
                    display_fps = display_fps_monitor.update()
                    layout = compute_letterbox(
                        frame.shape[1],
                        frame.shape[0],
                        self.settings.display_width,
                        self.settings.display_height,
                    )

                    if should_submit_recognition(
                        frame_count,
                        self.settings.recognition_interval_frames,
                    ):
                        recognition_worker.submit_frame(frame_count, frame)

                    if should_submit_gesture_frame(
                        frame_count,
                        self.settings.gesture_interval_frames,
                        self.view_state.gestures_enabled,
                    ):
                        if self._gesture_worker is not None:
                            self._gesture_worker.submit_frame(frame)

                    cached_results = recognition_worker.read_latest()
                    self._store_latest_results(cached_results)
                    self._update_event_feed_from_recognition(cached_results)

                    recognition_version = recognition_worker.read_version()
                    if recognition_version != self._last_recognition_version:
                        self.face_tracker.apply_recognition(frame, cached_results)
                        self._last_recognition_version = recognition_version

                    tracker_started_at = time.perf_counter()
                    tracker_snapshot = self.face_tracker.update(frame)
                    tracker_ms = (time.perf_counter() - tracker_started_at) * 1000.0

                    gesture_events = (
                        self._gesture_worker.read_latest()
                        if self._gesture_worker is not None
                        else []
                    )
                    visible_gestures = filter_desktop_gesture_events(gesture_events)
                    self._update_action_feedback(visible_gestures)
                    action_badges = self.action_feedback.update()

                    host_handle = self._resolve_host_handle(cached_results, tracker_snapshot)

                    draw_started_at = time.perf_counter()
                    output = self.renderer.draw_runtime_view(
                        frame=frame,
                        layout=layout,
                        tracker_snapshot=tracker_snapshot,
                        view_state=self.view_state,
                        event_feed=self.event_feed.entries(),
                        action_badges=action_badges,
                        display_fps=display_fps,
                        recognition_fps=recognition_worker.read_recognition_fps(),
                        frame_timing=self._display_timing,
                        host_handle=host_handle,
                    )
                    draw_ms = (time.perf_counter() - draw_started_at) * 1000.0

                    imshow_started_at = time.perf_counter()
                    cv2.imshow(WINDOW_TITLE, output)
                    key = cv2.waitKey(1) & 0xFF
                    imshow_ms = (time.perf_counter() - imshow_started_at) * 1000.0

                    if key != 255:
                        previous_gestures = self.view_state.gestures_enabled
                        if handle_view_key(key, self.view_state, WINDOW_TITLE):
                            logger.info("Stop requested by user")
                            break
                        if self.view_state.gestures_enabled and not previous_gestures:
                            self._ensure_gesture_worker(event_dispatcher)
                            self.event_feed.push("Gesture detection enabled")
                            logger.info("Gesture detection enabled via keyboard")
                        elif not self.view_state.gestures_enabled and previous_gestures:
                            self.event_feed.push("Gesture detection disabled")
                            logger.info("Gesture detection disabled via keyboard")

                    total_frame_ms = (time.perf_counter() - frame_started_at) * 1000.0
                    self._display_timing = self._frame_timing.update(
                        FrameTimingSnapshot(
                            camera_ms=camera_ms,
                            tracker_ms=tracker_ms,
                            draw_ms=draw_ms,
                            imshow_ms=imshow_ms,
                            total_frame_ms=total_frame_ms,
                            frame_width=frame.shape[1],
                            frame_height=frame.shape[0],
                        )
                    )
        finally:
            if self._gesture_worker is not None:
                self._gesture_worker.stop()
            recognition_worker.stop()
            event_dispatcher.stop()
            if self._gesture_detector is not None:
                self._gesture_detector.close()
            cv2.destroyAllWindows()
            logger.info("Desktop camera stopped")

    def _ensure_gesture_worker(self, event_dispatcher: AsyncEventDispatcher) -> None:
        if self._gesture_worker is not None:
            return
        try:
            self._gesture_detector = GestureDetector()
            self._gesture_worker = GestureWorker(
                self._gesture_detector,
                on_gestures=event_dispatcher.submit_gestures,
                primary_username_provider=self._read_primary_username,
            )
            self._gesture_worker.start()
            logger.info("Gesture worker started (Thumbs Up, Raise Hand)")
        except BaseException as error:
            if isinstance(error, KeyboardInterrupt):
                raise
            self.view_state.gestures_enabled = False
            logger.exception("Gesture detection unavailable; continuing without gestures")

    def _update_event_feed_from_recognition(self, results: list[RecognitionResult]) -> None:
        for result in results:
            if not result.is_known:
                continue
            if result.label in self._seen_identities:
                continue
            self._seen_identities.add(result.label)
            self.event_feed.push(f"{format_host_handle(result.label)} joined")

    def _update_action_feedback(self, gesture_events) -> None:
        current_time = time.perf_counter()
        for event in gesture_events:
            previous_time = self._gesture_feedback_at.get(event.name, -999.0)
            if current_time - previous_time < 2.5:
                continue
            self._gesture_feedback_at[event.name] = current_time
            self.action_feedback.trigger(event.name)
            username = self._read_primary_username()
            self.event_feed.push(gesture_event_feed_message(event.name, username))

    def _resolve_host_handle(
        self,
        results: list[RecognitionResult],
        tracker_snapshot,
    ) -> str:
        for result in results:
            if result.is_known:
                return format_host_handle(result.label, self.settings.host_handle)
        if tracker_snapshot.is_known and tracker_snapshot.label:
            return format_host_handle(tracker_snapshot.label, self.settings.host_handle)
        return self.settings.host_handle

    def _startup_backend_check(self) -> None:
        if self.backend_client.health_check():
            logger.info("Connected to backend at %s", self.settings.backend_url)
            self.backend_client.reload_face_profiles_hint()
            self.event_feed.push("Connected to dashboard backend")
        else:
            logger.warning(
                "Backend is unreachable at %s. Events will retry in the background.",
                self.settings.backend_url,
            )
            self.event_feed.push("Backend offline, events will retry")

    def _store_latest_results(self, results: list[RecognitionResult]) -> None:
        with self._results_lock:
            self._latest_results = results

    def _read_primary_username(self) -> str:
        with self._results_lock:
            return get_primary_username(self._latest_results)
