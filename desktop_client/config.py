from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class DesktopClientSettings:
    backend_url: str = "http://127.0.0.1:8000"
    client_id: str = "desktop-camera"
    debug_overlay: bool = False
    request_timeout_sec: float = 5.0
    identity_disappear_grace_sec: float = 1.0
    event_batch_interval_sec: float = 0.25
    camera_index: int = 0
    camera_width: int = 640
    camera_height: int = 480
    display_width: int = 1280
    display_height: int = 720
    max_camera_grab: int = 5
    recognition_interval_frames: int = 8
    gesture_interval_frames: int = 4
    enable_gestures: bool = False
    tracker_name: str = "mosse"
    host_handle: str = "@hoang"
    viewer_count: int = 128


def load_settings(
    *,
    backend_url: str | None = None,
    debug_overlay: bool = False,
    client_id: str | None = None,
    camera_index: int = 0,
    camera_width: int = 640,
    camera_height: int = 480,
    display_width: int = 1280,
    display_height: int = 720,
    max_camera_grab: int = 5,
    recognition_interval_frames: int = 8,
    gesture_interval_frames: int = 4,
    enable_gestures: bool = False,
    tracker_name: str = "mosse",
    host_handle: str = "@hoang",
    viewer_count: int = 128,
) -> DesktopClientSettings:
    normalized_tracker = tracker_name.strip().lower()
    if normalized_tracker not in {"kcf", "csrt", "mosse", "none"}:
        raise ValueError(f"Unsupported tracker: {tracker_name}")

    return DesktopClientSettings(
        backend_url=(backend_url or os.getenv("DESKTOP_BACKEND_URL", "http://127.0.0.1:8000")).rstrip(
            "/"
        ),
        client_id=client_id or os.getenv("DESKTOP_CLIENT_ID", "desktop-camera"),
        debug_overlay=debug_overlay,
        request_timeout_sec=float(os.getenv("DESKTOP_REQUEST_TIMEOUT_SEC", "5")),
        identity_disappear_grace_sec=float(
            os.getenv("DESKTOP_IDENTITY_DISAPPEAR_GRACE_SEC", "1.0")
        ),
        event_batch_interval_sec=float(os.getenv("DESKTOP_EVENT_BATCH_INTERVAL_SEC", "0.25")),
        camera_index=int(os.getenv("DESKTOP_CAMERA_INDEX", camera_index)),
        camera_width=int(os.getenv("DESKTOP_CAMERA_WIDTH", camera_width)),
        camera_height=int(os.getenv("DESKTOP_CAMERA_HEIGHT", camera_height)),
        display_width=int(os.getenv("DESKTOP_DISPLAY_WIDTH", display_width)),
        display_height=int(os.getenv("DESKTOP_DISPLAY_HEIGHT", display_height)),
        max_camera_grab=int(os.getenv("DESKTOP_MAX_CAMERA_GRAB", max_camera_grab)),
        recognition_interval_frames=int(
            os.getenv("DESKTOP_RECOGNITION_INTERVAL", recognition_interval_frames)
        ),
        gesture_interval_frames=int(
            os.getenv("DESKTOP_GESTURE_INTERVAL", gesture_interval_frames)
        ),
        enable_gestures=enable_gestures,
        tracker_name=normalized_tracker,
        host_handle=os.getenv("DESKTOP_HOST_HANDLE", host_handle),
        viewer_count=int(os.getenv("DESKTOP_VIEWER_COUNT", viewer_count)),
    )
