from __future__ import annotations

import numpy as np

from desktop_client.pipeline.display_compositor import compute_letterbox, letterbox_frame, map_bbox, map_point
from desktop_client.pipeline.livestream_renderer import LivestreamRenderer
from desktop_client.pipeline.livestream_state import (
    ActionFeedbackState,
    EventFeedBuffer,
    StreamTimer,
    ViewState,
    format_host_handle,
    gesture_badge_text,
    gesture_event_feed_message,
    should_submit_gesture_frame,
)
from desktop_client.pipeline.window_controls import handle_view_key
from utils.geometry import BoundingBox


def test_compute_letterbox_centers_640x480_on_1280x720() -> None:
    layout = compute_letterbox(640, 480, 1280, 720)

    assert layout.scaled_width == 960
    assert layout.scaled_height == 720
    assert layout.offset_x == 160
    assert layout.offset_y == 0


def test_letterbox_frame_has_black_bars() -> None:
    frame = np.full((480, 640, 3), 128, dtype=np.uint8)
    layout = compute_letterbox(640, 480, 1280, 720)
    canvas = letterbox_frame(frame, layout)

    assert canvas.shape == (720, 1280, 3)
    assert canvas[10, 10].tolist() == [0, 0, 0]
    assert canvas[360, 640].tolist() == [128, 128, 128]


def test_map_bbox_scales_with_letterbox() -> None:
    layout = compute_letterbox(640, 480, 1280, 720)
    bbox = BoundingBox(100, 50, 200, 150)
    mapped = map_bbox(bbox, layout)

    assert mapped.x1 == 160 + int(round(100 * layout.scale))
    assert mapped.y1 == int(round(50 * layout.scale))


def test_map_point_matches_bbox_origin() -> None:
    layout = compute_letterbox(640, 480, 1280, 720)
    x, y = map_point(0, 0, layout)
    assert x == layout.offset_x
    assert y == layout.offset_y


def test_view_state_debug_enables_bbox() -> None:
    view_state = ViewState()
    assert view_state.debug_overlay is False
    assert view_state.show_bbox is False

    view_state.toggle_debug()
    assert view_state.debug_overlay is True
    assert view_state.show_bbox is True


def test_handle_view_key_toggles_and_quits() -> None:
    view_state = ViewState()
    assert handle_view_key(ord("d"), view_state) is False
    assert view_state.debug_overlay is True

    assert handle_view_key(ord("q"), view_state) is True


def test_event_feed_buffer_keeps_recent_entries() -> None:
    feed = EventFeedBuffer(max_entries=3)
    feed.push("one")
    feed.push("two")
    feed.push("three")
    feed.push("four")

    messages = [entry.message for entry in feed.entries()]
    assert messages == ["four", "three", "two"]


def test_action_feedback_expires() -> None:
    feedback = ActionFeedbackState()
    feedback.trigger("Thumbs Up")

    assert feedback.update()[0].label == "THUMBS UP"
    feedback._badges[0].frames_left = 1
    assert feedback.update() == []


def test_format_host_handle_adds_at_prefix() -> None:
    assert format_host_handle("hoang") == "@hoang"
    assert format_host_handle("@hoang") == "@hoang"
    assert format_host_handle("Viewer") == "@hoang"


def test_gesture_helpers() -> None:
    assert gesture_badge_text("Raise Hand") == ("RAISE HAND", "HAND")
    assert gesture_event_feed_message("Thumbs Up", "hoang") == "@hoang sent Thumbs Up"
    assert should_submit_gesture_frame(1, 4, True) is True
    assert should_submit_gesture_frame(2, 4, True) is False
    assert should_submit_gesture_frame(2, 4, False) is False


def test_livestream_renderer_returns_canvas() -> None:
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    layout = compute_letterbox(640, 480, 1280, 720)
    renderer = LivestreamRenderer()
    from desktop_client.pipeline.face_tracker import FaceTrackerController
    from face_recognition.recognizer import RecognitionResult

    tracker = FaceTrackerController("mosse")
    result = RecognitionResult(
        bbox=BoundingBox(200, 120, 320, 280),
        label="hoang",
        similarity=0.92,
        is_known=True,
    )
    tracker.apply_recognition(frame, [result])
    snapshot = tracker.update(frame)

    canvas = renderer.draw_runtime_view(
        frame=frame,
        layout=layout,
        tracker_snapshot=snapshot,
        view_state=ViewState(),
        event_feed=[],
        action_badges=[],
        display_fps=29.0,
        host_handle="@hoang",
    )

    assert canvas.shape == (720, 1280, 3)


def test_stream_timer_formats_elapsed_time() -> None:
    timer = StreamTimer()
    timer._started_at = 0.0
    assert timer.elapsed_text(now=65.0) == "01:05"
