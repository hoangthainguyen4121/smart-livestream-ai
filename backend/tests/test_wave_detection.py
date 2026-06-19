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
        "min_peak_to_peak": 0.048,
        "min_path_length": 0.09,
        "max_wrist_y": 0.82,
        "min_span_seconds": 0.4,
        "cooldown_seconds": 2.5,
        "missed_frame_grace": 4,
        "min_samples": 5,
        "min_delta": 0.004,
    }
    defaults.update(overrides)
    return WaveTracker(**defaults)


def test_wave_tracker_detects_deliberate_side_to_side_wave() -> None:
    tracker = make_tracker()
    values = [0.40, 0.46, 0.40, 0.46, 0.40, 0.46]

    detected = False
    for index, x in enumerate(values):
        if tracker.observe(x, wrist_y=0.58, now=0.1 + (index * 0.12)):
            detected = True
            break

    assert detected is True


def test_wave_tracker_allows_shoulder_level_wave_without_raise_hand() -> None:
    tracker = make_tracker()
    values = [0.42, 0.48, 0.42, 0.48, 0.42, 0.48]
    # y=0.58 is below raise-hand threshold (~0.42) but still trackable for wave.
    detected = False
    for index, x in enumerate(values):
        if tracker.observe(x, wrist_y=0.58, now=0.1 + (index * 0.12)):
            detected = True
            break

    assert detected is True


def test_wave_tracker_rejects_still_raised_hand() -> None:
    tracker = make_tracker()
    detected = False
    for index in range(10):
        if tracker.observe(0.45, wrist_y=0.30, now=0.1 + (index * 0.12)):
            detected = True

    assert detected is False


def test_wave_tracker_rejects_insufficient_horizontal_motion() -> None:
    tracker = make_tracker()
    detected = False
    for index in range(8):
        if tracker.observe(0.45, wrist_y=0.55, now=0.1 + (index * 0.12)):
            detected = True

    assert detected is False


def test_wave_tracker_rejects_hand_too_low_in_frame() -> None:
    tracker = make_tracker()
    values = [0.40, 0.46, 0.40, 0.46, 0.40, 0.46]

    detected = False
    for index, x in enumerate(values):
        if tracker.observe(x, wrist_y=0.90, now=0.1 + (index * 0.12)):
            detected = True

    assert detected is False


def test_wave_tracker_applies_cooldown_after_detection() -> None:
    tracker = make_tracker(cooldown_seconds=2.5)
    values = [0.40, 0.46, 0.40, 0.46, 0.40, 0.46]

    first_detection_at = None
    for index, x in enumerate(values):
        now = 0.1 + (index * 0.12)
        if tracker.observe(x, wrist_y=0.55, now=now):
            first_detection_at = now
            break

    assert first_detection_at is not None
    assert tracker.observe(0.46, wrist_y=0.55, now=first_detection_at + 0.5) is False


def test_wave_trackers_are_independent() -> None:
    left = make_tracker()
    right = make_tracker()

    for index in range(4):
        right.observe(0.45, wrist_y=0.55, now=0.1 + (index * 0.12))

    assert left.observe(0.48, wrist_y=0.55, now=1.0) is False

    right_detected = False
    for index, x in enumerate([0.40, 0.46, 0.40, 0.46, 0.40, 0.46]):
        if right.observe(x, wrist_y=0.55, now=1.0 + (index * 0.12)):
            right_detected = True
            break

    assert right_detected is True
