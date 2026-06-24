from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop_client.pipeline.face_tracker import (  # noqa: E402
    IDENTITY_GRACE_MS,
    TRACKER_LOST_GRACE_MS,
    normalize_tracker_rect,
    rect_to_bbox,
    resolve_tracker_label,
    tracker_init_succeeded,
)
from utils.geometry import BoundingBox  # noqa: E402


def test_resolve_tracker_label_returns_username_when_identity_is_recent() -> None:
    label, is_known = resolve_tracker_label(
        username="hoang",
        similarity=0.91,
        status="tracking",
        has_bbox=True,
        now=10.0,
        last_identity_at=9.0,
    )

    assert label == "hoang"
    assert is_known is True


def test_resolve_tracker_label_returns_detecting_without_identity() -> None:
    label, is_known = resolve_tracker_label(
        username=None,
        similarity=None,
        status="tracking",
        has_bbox=True,
        now=10.0,
        last_identity_at=0.0,
    )

    assert label == "Detecting..."
    assert is_known is False


def test_resolve_tracker_label_hides_when_tracker_lost() -> None:
    label, is_known = resolve_tracker_label(
        username="hoang",
        similarity=0.91,
        status="lost",
        has_bbox=True,
        now=10.0,
        last_identity_at=9.5,
    )

    assert label is None
    assert is_known is False


def test_resolve_tracker_label_keeps_identity_within_grace() -> None:
    label, is_known = resolve_tracker_label(
        username="hoang",
        similarity=0.91,
        status="grace",
        has_bbox=True,
        now=10.0,
        last_identity_at=10.0 - (IDENTITY_GRACE_MS / 1000.0) + 0.1,
    )

    assert label == "hoang"
    assert is_known is True


def test_rect_to_bbox_clamps_to_frame() -> None:
    bbox = rect_to_bbox((700, 10, 200, 200), frame_width=640, frame_height=480)

    assert isinstance(bbox, BoundingBox)
    assert bbox.x1 >= 0
    assert bbox.y2 <= 480
    assert bbox.x2 <= 640


def test_tracker_grace_constants_are_short() -> None:
    assert TRACKER_LOST_GRACE_MS < IDENTITY_GRACE_MS


def test_tracker_init_succeeded_treats_none_as_success() -> None:
    assert tracker_init_succeeded(None) is True
    assert tracker_init_succeeded(True) is True
    assert tracker_init_succeeded(False) is False


def test_normalize_tracker_rect_rejects_tiny_boxes() -> None:
    bbox = BoundingBox(10, 10, 15, 15)
    assert normalize_tracker_rect(bbox, frame_width=640, frame_height=480, min_size=11) is None


def test_normalize_tracker_rect_accepts_valid_boxes() -> None:
    bbox = BoundingBox(120, 80, 220, 220)
    rect = normalize_tracker_rect(bbox, frame_width=640, frame_height=480, min_size=11)
    assert rect == (120, 80, 100, 140)


def test_resolve_tracker_label_supports_initializing_state() -> None:
    label, is_known = resolve_tracker_label(
        username=None,
        similarity=None,
        status="initializing",
        has_bbox=True,
        now=1.0,
        last_identity_at=0.0,
    )
    assert label == "Detecting..."
    assert is_known is False
