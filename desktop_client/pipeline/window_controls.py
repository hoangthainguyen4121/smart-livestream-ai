from __future__ import annotations

import logging
import sys

import cv2

from desktop_client.pipeline.livestream_state import ViewState


logger = logging.getLogger(__name__)

WINDOW_TITLE = "AI Livestream Demo"


def setup_display_window(width: int, height: int, title: str = WINDOW_TITLE) -> None:
    cv2.namedWindow(title, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(title, width, height)
    try_hide_crosshair_cursor(title)


def try_hide_crosshair_cursor(title: str) -> bool:
    """OpenCV highgui does not expose a reliable cross-platform cursor API.

    On Windows the plus/crosshair cursor can still appear over imshow windows.
    """
    if sys.platform != "win32":
        logger.info("Cursor normalization is best-effort on this platform.")
        return False

    try:
        import ctypes

        class POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        class CURSORINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", ctypes.c_uint),
                ("flags", ctypes.c_uint),
                ("hCursor", ctypes.c_void_p),
            ]

        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, title)
        if not hwnd:
            logger.info(
                "OpenCV window handle not found for cursor normalization; "
                "crosshair cursor may still appear."
            )
            return False

        arrow_cursor = user32.LoadCursorW(None, 32512)
        if arrow_cursor:
            user32.SetClassLongPtrW(hwnd, -12, arrow_cursor)
            logger.info("Requested default arrow cursor for OpenCV window.")
            return True
    except Exception as error:
        logger.info("Cursor normalization unavailable: %s", error)

    logger.info(
        "OpenCV cannot hide the mouse cursor reliably. "
        "If a crosshair/plus cursor appears, it is a HighGUI limitation."
    )
    return False


def set_fullscreen(title: str, enabled: bool) -> bool:
    property_value = cv2.WINDOW_FULLSCREEN if enabled else cv2.WINDOW_NORMAL
    cv2.setWindowProperty(title, cv2.WND_PROP_FULLSCREEN, property_value)
    if not enabled:
        return False
    return cv2.getWindowProperty(title, cv2.WND_PROP_FULLSCREEN) >= 1.0


def handle_view_key(key: int, view_state: ViewState, window_title: str = WINDOW_TITLE) -> bool:
    """Apply keyboard toggles. Returns True when the app should quit."""
    if key in (ord("q"), ord("Q"), 27):
        return True
    if key in (ord("d"), ord("D")):
        view_state.toggle_debug()
    elif key in (ord("g"), ord("G")):
        view_state.gestures_enabled = not view_state.gestures_enabled
    elif key in (ord("b"), ord("B")):
        view_state.toggle_bbox()
    elif key in (ord("f"), ord("F")):
        view_state.fullscreen = set_fullscreen(window_title, not view_state.fullscreen)
    return False
