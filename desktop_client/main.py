from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smart Livestream desktop camera client (Windows-native OpenCV AI camera)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run the desktop camera client")
    run_parser.add_argument(
        "--backend-url",
        default=None,
        help="Backend API base URL (default: http://127.0.0.1:8000)",
    )
    run_parser.add_argument(
        "--camera-index",
        type=int,
        default=0,
        help="Webcam device index (default: 0)",
    )
    run_parser.add_argument(
        "--width",
        type=int,
        default=640,
        help="Capture width (default: 640)",
    )
    run_parser.add_argument(
        "--height",
        type=int,
        default=480,
        help="Camera capture height (default: 480)",
    )
    run_parser.add_argument(
        "--display-width",
        type=int,
        default=1280,
        help="Display canvas width (default: 1280)",
    )
    run_parser.add_argument(
        "--display-height",
        type=int,
        default=720,
        help="Display canvas height (default: 720)",
    )
    run_parser.add_argument(
        "--recognition-interval",
        type=int,
        default=8,
        help="Submit one frame to the recognition worker every N display frames (default: 8)",
    )
    run_parser.add_argument(
        "--max-grab",
        type=int,
        default=5,
        help="Bounded camera buffer drain before read (default: 5)",
    )
    run_parser.add_argument(
        "--tracker",
        choices=("kcf", "csrt", "mosse", "none"),
        default="mosse",
        help="OpenCV face tracker for realtime label position (default: mosse)",
    )
    run_parser.add_argument(
        "--gesture-interval",
        type=int,
        default=4,
        help="Submit one frame to gesture worker every N display frames when enabled (default: 4)",
    )
    run_parser.add_argument(
        "--host-handle",
        default="@hoang",
        help="Host tag shown in the livestream overlay (default: @hoang)",
    )
    run_parser.add_argument(
        "--debug",
        action="store_true",
        help="Show debug overlay (FPS, timing, optional bboxes)",
    )
    run_parser.add_argument(
        "--client-id",
        default=None,
        help="Client identifier sent with desktop events",
    )
    gesture_group = run_parser.add_mutually_exclusive_group()
    gesture_group.add_argument(
        "--gestures",
        action="store_true",
        help="Enable gesture detection worker",
    )
    gesture_group.add_argument(
        "--no-gestures",
        action="store_true",
        help="Disable gesture detection (default)",
    )

    return parser.parse_args()


def setup_logging() -> None:
    from utils.logger import setup_logging as configure_logging

    configure_logging()


def main() -> int:
    setup_logging()
    args = parse_args()
    logger = logging.getLogger(__name__)

    if args.command == "run":
        from desktop_client.config import load_settings
        from desktop_client.pipeline.runtime import DesktopCameraRuntime

        enable_gestures = bool(args.gestures) and not args.no_gestures

        settings = load_settings(
            backend_url=args.backend_url,
            debug_overlay=args.debug,
            client_id=args.client_id,
            camera_index=args.camera_index,
            camera_width=args.width,
            camera_height=args.height,
            display_width=args.display_width,
            display_height=args.display_height,
            max_camera_grab=args.max_grab,
            recognition_interval_frames=args.recognition_interval,
            gesture_interval_frames=args.gesture_interval,
            enable_gestures=enable_gestures,
            tracker_name=args.tracker,
            host_handle=args.host_handle,
        )
        logger.info(
            "Starting desktop client backend=%s camera=%sx%s display=%sx%s "
            "interval=%s tracker=%s gestures=%s debug=%s",
            settings.backend_url,
            settings.camera_width,
            settings.camera_height,
            settings.display_width,
            settings.display_height,
            settings.recognition_interval_frames,
            settings.tracker_name,
            settings.enable_gestures,
            settings.debug_overlay,
        )
        DesktopCameraRuntime(settings).run()
        return 0

    logger.error("Unsupported command: %s", args.command)
    return 1


if __name__ == "__main__":
    sys.exit(main())
