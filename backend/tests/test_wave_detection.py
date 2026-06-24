from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

for path in (BACKEND_ROOT, PROJECT_ROOT):
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)

from gesture_detection.wave_tracker import WaveTracker  # noqa: E402


def make_tracker(**overrides) -> WaveTracker:
    defaults = {
        "window_seconds": 2.5,
        "min_reversals": 2,
        "min_peak_to_peak": 0.055,
        "min_path_length": 0.10,
        "min_wrist_y": 0.18,
        "max_wrist_y": 0.88,
        "min_span_seconds": 0.35,
        "cooldown_seconds": 2.5,
        "missed_frame_grace": 4,
        "min_samples": 10,
        "max_samples": 15,
        "min_delta": 0.006,
    }
    defaults.update(overrides)
    return WaveTracker(**defaults)


def oscillating_wrist_x(count: int = 12) -> list[float]:
    pattern = [0.40, 0.46, 0.40, 0.46, 0.40, 0.46]
    return [pattern[index % len(pattern)] for index in range(count)]


def test_wave_tracker_detects_deliberate_side_to_side_wave() -> None:
    tracker = make_tracker()

    detected = False
    for index, x in enumerate(oscillating_wrist_x()):
        if tracker.observe(x, wrist_y=0.58, now=0.1 + (index * 0.12), hand_open=True):
            detected = True
            break

    assert detected is True


def test_wave_tracker_allows_shoulder_level_wave_without_raise_hand() -> None:
    tracker = make_tracker()
    detected = False
    for index, x in enumerate(oscillating_wrist_x()):
        if tracker.observe(x, wrist_y=0.58, now=0.1 + (index * 0.12), hand_open=True):
            detected = True
            break

    assert detected is True


def test_wave_tracker_rejects_still_raised_hand() -> None:
    tracker = make_tracker()
    detected = False
    for index in range(12):
        if tracker.observe(0.45, wrist_y=0.30, now=0.1 + (index * 0.12), hand_open=True):
            detected = True

    assert detected is False


def test_wave_tracker_rejects_open_hand_without_horizontal_motion() -> None:
    tracker = make_tracker()
    detected = False
    for index in range(12):
        if tracker.observe(0.45, wrist_y=0.55, now=0.1 + (index * 0.12), hand_open=True):
            detected = True

    assert detected is False


def test_wave_tracker_rejects_closed_hand_even_with_motion() -> None:
    tracker = make_tracker()
    detected = False
    for index, x in enumerate(oscillating_wrist_x()):
        if tracker.observe(x, wrist_y=0.55, now=0.1 + (index * 0.12), hand_open=False):
            detected = True

    assert detected is False


def test_wave_tracker_rejects_hand_too_low_in_frame() -> None:
    tracker = make_tracker()
    detected = False
    for index, x in enumerate(oscillating_wrist_x()):
        if tracker.observe(x, wrist_y=0.90, now=0.1 + (index * 0.12), hand_open=True):
            detected = True

    assert detected is False


def test_wave_tracker_applies_cooldown_after_detection() -> None:
    tracker = make_tracker(cooldown_seconds=2.5)

    first_detection_at = None
    for index, x in enumerate(oscillating_wrist_x()):
        now = 0.1 + (index * 0.12)
        if tracker.observe(x, wrist_y=0.55, now=now, hand_open=True):
            first_detection_at = now
            break

    assert first_detection_at is not None
    assert tracker.observe(0.46, wrist_y=0.55, now=first_detection_at + 0.5, hand_open=True) is False


def test_wave_trackers_are_independent() -> None:
    left = make_tracker()
    right = make_tracker()

    for index in range(6):
        right.observe(0.45, wrist_y=0.55, now=0.1 + (index * 0.12), hand_open=True)

    assert left.observe(0.48, wrist_y=0.55, now=1.0, hand_open=True) is False

    right_detected = False
    for index, x in enumerate(oscillating_wrist_x()):
        if right.observe(x, wrist_y=0.55, now=1.0 + (index * 0.12), hand_open=True):
            right_detected = True
            break

    assert right_detected is True


def test_wave_tracker_debug_state_reports_motion_metrics() -> None:
    tracker = make_tracker()
    for index, x in enumerate(oscillating_wrist_x(6)):
        tracker.observe(x, wrist_y=0.55, now=0.1 + (index * 0.12), hand_open=True)

    debug = tracker.debug_state()
    assert debug["direction_changes"] >= 1
    assert debug["amplitude"] > 0
