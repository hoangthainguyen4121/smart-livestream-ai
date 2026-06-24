"""Benchmark desktop pipeline stages without requiring a live camera preview loop."""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from desktop_client.pipeline.display_compositor import compute_letterbox  # noqa: E402
from desktop_client.pipeline.face_tracker import FaceTrackerController  # noqa: E402
from desktop_client.pipeline.livestream_renderer import LivestreamRenderer  # noqa: E402
from desktop_client.pipeline.livestream_state import ViewState  # noqa: E402
from face_recognition.recognizer import RecognitionResult  # noqa: E402
from utils.geometry import BoundingBox  # noqa: E402


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int(round((pct / 100.0) * (len(ordered) - 1)))
    return ordered[index]


def benchmark_tracker(tracker_name: str, width: int, height: int, iterations: int) -> dict[str, float]:
    frame = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    bbox = BoundingBox(width // 4, height // 4, width // 2 + width // 4, height // 2 + height // 4)
    tracker = FaceTrackerController(tracker_name)
    result = RecognitionResult(bbox=bbox, label="bench", similarity=0.95, is_known=True)
    tracker.apply_recognition(frame, [result])

    samples: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        tracker.update(frame)
        samples.append((time.perf_counter() - started) * 1000.0)

    return {
        "mean_ms": statistics.mean(samples),
        "p50_ms": percentile(samples, 50),
        "p95_ms": percentile(samples, 95),
        "max_fps": 1000.0 / max(statistics.mean(samples), 0.001),
    }


def benchmark_draw(width: int, height: int, iterations: int, debug_overlay: bool = True) -> dict[str, float]:
    frame = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    renderer = LivestreamRenderer(canvas_width=1280, canvas_height=720)
    layout = compute_letterbox(width, height, 1280, 720)
    view_state = ViewState(debug_overlay=debug_overlay, show_bbox=debug_overlay)
    bbox = BoundingBox(width // 4, height // 4, width // 2 + width // 4, height // 2 + height // 4)
    tracker = FaceTrackerController("mosse")
    result = RecognitionResult(bbox=bbox, label="bench", similarity=0.95, is_known=True)
    tracker.apply_recognition(frame, [result])
    snapshot = tracker.update(frame)

    samples: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        renderer.draw_runtime_view(
            frame=frame,
            layout=layout,
            tracker_snapshot=snapshot,
            view_state=view_state,
            event_feed=[],
            action_badges=[],
            display_fps=30.0,
            recognition_fps=2.0,
        )
        samples.append((time.perf_counter() - started) * 1000.0)

    return {
        "mean_ms": statistics.mean(samples),
        "p50_ms": percentile(samples, 50),
        "p95_ms": percentile(samples, 95),
    }


def benchmark_copy(width: int, height: int, iterations: int) -> dict[str, float]:
    frame = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    samples: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter()
        frame.copy()
        samples.append((time.perf_counter() - started) * 1000.0)
    return {"mean_ms": statistics.mean(samples), "p95_ms": percentile(samples, 95)}


def benchmark_camera_read(width: int, height: int, iterations: int, camera_index: int, max_grab: int) -> dict[str, float]:
    from desktop_client.pipeline.camera_reader import DesktopCamera

    samples: list[float] = []
    with DesktopCamera(index=camera_index, width=width, height=height, max_grab=max_grab) as camera:
        for _ in range(10):
            camera.read_latest()
        for _ in range(iterations):
            started = time.perf_counter()
            camera.read_latest()
            samples.append((time.perf_counter() - started) * 1000.0)
    return {
        "mean_ms": statistics.mean(samples),
        "p50_ms": percentile(samples, 50),
        "p95_ms": percentile(samples, 95),
        "max_fps": 1000.0 / max(statistics.mean(samples), 0.001),
    }


def print_section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark desktop pipeline stages")
    parser.add_argument("--iterations", type=int, default=120)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--max-grab", type=int, default=5)
    parser.add_argument("--skip-camera", action="store_true")
    args = parser.parse_args()

    print(f"OpenCV {cv2.__version__}")
    resolutions = [(640, 480), (320, 240)]

    print_section("Frame copy cost")
    for width, height in resolutions:
        stats = benchmark_copy(width, height, args.iterations)
        print(f"{width}x{height}: mean={stats['mean_ms']:.2f} ms p95={stats['p95_ms']:.2f} ms")

    print_section("Tracker update cost")
    for width, height in resolutions:
        for tracker in ("kcf", "mosse", "csrt"):
            stats = benchmark_tracker(tracker, width, height, args.iterations)
            print(
                f"{width}x{height} {tracker:>4}: mean={stats['mean_ms']:.2f} ms "
                f"p95={stats['p95_ms']:.2f} ms est_max_fps={stats['max_fps']:.1f}"
            )

    print_section("Overlay draw cost (debug overlay on)")
    for width, height in resolutions:
        stats = benchmark_draw(width, height, args.iterations, debug_overlay=True)
        print(f"{width}x{height}: mean={stats['mean_ms']:.2f} ms p95={stats['p95_ms']:.2f} ms")

    if not args.skip_camera:
        print_section("Camera read_latest cost")
        for width, height in resolutions:
            try:
                stats = benchmark_camera_read(
                    width,
                    height,
                    min(args.iterations, 90),
                    args.camera_index,
                    args.max_grab,
                )
                print(
                    f"{width}x{height}: mean={stats['mean_ms']:.2f} ms "
                    f"p95={stats['p95_ms']:.2f} ms est_max_fps={stats['max_fps']:.1f}"
                )
            except Exception as error:
                print(f"{width}x{height}: camera benchmark skipped ({error})")


if __name__ == "__main__":
    main()
