from __future__ import annotations

import argparse
import logging
from importlib.util import find_spec
import sys

logger = logging.getLogger(__name__)


class MissingDependencyError(Exception):
    def __init__(self, package_name: str) -> None:
        self.package_name = package_name
        super().__init__(package_name)


def register_user(username: str) -> None:
    validate_dependencies(("insightface", "onnxruntime"))

    from face_recognition.embedding_store import EmbeddingStore
    from face_recognition.recognizer import InsightFaceRecognizer
    from face_registration.registrar import FaceRegistrar

    store = EmbeddingStore()
    recognizer = InsightFaceRecognizer(store=store)
    registrar = FaceRegistrar(recognizer=recognizer, store=store)
    embedding_path = registrar.register_from_webcam(username)
    print(f"Registered '{username}'. Embedding saved to: {embedding_path}")


def run_livestream() -> None:
    validate_dependencies(("insightface", "onnxruntime"))

    logger.info("Importing runtime dependencies")
    import cv2

    from face_recognition.embedding_store import EmbeddingStore
    from face_recognition.recognizer import InsightFaceRecognizer
    from gesture_detection.gesture_detector import GestureDetector
    from gesture_detection.gesture_state import GestureEffectState
    from overlay_engine.overlay_renderer import OverlayRenderer
    from utils.camera import Camera
    from utils.fps_monitor import FPSMonitor

    gesture_detector: GestureDetector | None = None
    last_logged_gesture_frames: dict[str, int] = {}

    try:
        logger.info("Loading embedding store")
        store = EmbeddingStore()

        logger.info("Initializing InsightFace recognizer")
        recognizer = InsightFaceRecognizer(store=store)

        logger.info("Initializing MediaPipe gesture detector")
        try:
            gesture_detector = GestureDetector()
            logger.info("MediaPipe gesture detector initialized")
        except BaseException as error:
            if isinstance(error, KeyboardInterrupt):
                raise
            logger.exception(
                "MediaPipe gesture detector failed to initialize; "
                "continuing with face recognition only"
            )

        gesture_state = GestureEffectState()
        renderer = OverlayRenderer()
        fps_monitor = FPSMonitor()

        logger.info("Starting livestream PoC")
        with Camera() as camera:
            logger.info("Starting recognition loop")
            frame_count = 0
            while True:
                if frame_count == 0:
                    logger.info("Entering frame processing")

                frame = camera.read()
                frame_count += 1
                fps = fps_monitor.update()

                recognition_results = recognizer.recognize(frame)
                gesture_events = gesture_detector.detect(frame) if gesture_detector else []
                log_gesture_events(
                    gesture_events=gesture_events,
                    frame_count=frame_count,
                    last_logged_frames=last_logged_gesture_frames,
                )
                active_effects = gesture_state.update(gesture_events)

                output = renderer.draw_runtime_view(
                    frame=frame,
                    recognition_results=recognition_results,
                    active_gesture_effects=active_effects,
                    fps=fps,
                )

                cv2.imshow("Smart Livestream PoC", output)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    logger.info("Stop requested by user")
                    break
    except BaseException:
        logger.exception("Run mode failed")
        raise
    finally:
        if gesture_detector is not None:
            gesture_detector.close()
        cv2.destroyAllWindows()
        logger.info("Stopped livestream PoC")


def log_gesture_events(
    gesture_events: list["GestureEvent"],
    frame_count: int,
    last_logged_frames: dict[str, int],
    cooldown_frames: int = 30,
) -> None:
    for event in gesture_events:
        last_logged_frame = last_logged_frames.get(event.name, -cooldown_frames)
        if frame_count - last_logged_frame < cooldown_frames:
            continue

        logger.info(
            "Gesture detected: %s confidence=%.2f frame=%s",
            event.name,
            event.confidence,
            frame_count,
        )
        last_logged_frames[event.name] = frame_count


def check_gesture() -> bool:
    validate_dependencies(("mediapipe",))

    import mediapipe as mp

    from gesture_detection.gesture_detector import (
        GestureDetector,
        get_mediapipe_version,
        has_solutions_hands,
        log_mediapipe_compatibility,
    )

    version = get_mediapipe_version()
    has_solutions = hasattr(mp, "solutions")
    has_hands = has_solutions_hands()

    print(f"MediaPipe version: {version}")
    print(f"mp.solutions exists: {has_solutions}")
    print(f"mp.solutions.hands available: {has_hands}")

    log_mediapipe_compatibility()

    detector: GestureDetector | None = None
    try:
        detector = GestureDetector()
        print("GestureDetector initialization: SUCCESS")
        return True
    except Exception as error:
        logger.exception("GestureDetector diagnostic failed")
        print(f"GestureDetector initialization: FAILED - {error}")
        return False
    finally:
        if detector is not None:
            detector.close()


def list_users() -> None:
    from face_recognition.embedding_store import EmbeddingStore

    users = EmbeddingStore().list_users()
    if not users:
        print("No registered users.")
        return

    for user in users:
        print(f"{user.display_name} | samples={user.samples} | file={user.embedding_path.name}")


def delete_user(username: str) -> None:
    from face_recognition.embedding_store import EmbeddingStore

    deleted = EmbeddingStore().delete_user(username)
    if deleted:
        print(f"Deleted user '{username}'.")
    else:
        print(f"User '{username}' was not found.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smart Livestream Face and Gesture PoC")
    subparsers = parser.add_subparsers(dest="command", required=True)

    register_parser = subparsers.add_parser("register", help="Register a user from webcam")
    register_parser.add_argument("--username", required=True, help="Display name for the user")

    subparsers.add_parser("run", help="Run real-time recognition and gesture detection")
    subparsers.add_parser("list-users", help="List registered users")
    subparsers.add_parser("check-gesture", help="Check MediaPipe gesture compatibility")

    delete_parser = subparsers.add_parser("delete-user", help="Delete a registered user")
    delete_parser.add_argument("--username", required=True, help="User to delete")

    return parser.parse_args()


def validate_dependencies(package_names: tuple[str, ...]) -> None:
    for package_name in package_names:
        if find_spec(package_name) is None:
            raise MissingDependencyError(package_name)


def setup_app_logging() -> None:
    from utils.logger import setup_logging

    setup_logging()


def main() -> int:
    setup_app_logging()
    args = parse_args()

    try:
        if args.command == "register":
            register_user(args.username)
        elif args.command == "run":
            run_livestream()
        elif args.command == "list-users":
            list_users()
        elif args.command == "delete-user":
            delete_user(args.username)
        elif args.command == "check-gesture":
            return 0 if check_gesture() else 1
        else:
            raise ValueError(f"Unsupported command: {args.command}")
    except MissingDependencyError as error:
        print(
            f"Missing dependency: {error.package_name}. "
            "Please run: pip install -r requirements.txt"
        )
        return 1
    except ModuleNotFoundError as error:
        missing_name = error.name or "unknown"
        print(
            f"Missing dependency: {missing_name}. "
            "Please run: pip install -r requirements.txt"
        )
        return 1
    except BaseException as error:
        logger.exception("Application failed")
        print(f"Application error: {error}")
        print("See logs/app.log for details.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
