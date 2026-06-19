from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class WaveTracker:
    window_seconds: float = 2.5
    min_reversals: int = 2
    min_peak_to_peak: float = 0.048
    min_path_length: float = 0.09
    max_wrist_y: float = 0.82
    min_span_seconds: float = 0.4
    cooldown_seconds: float = 2.5
    missed_frame_grace: int = 4
    min_samples: int = 5
    min_delta: float = 0.004

    _samples: deque[tuple[float, float]] = field(default_factory=deque, init=False, repr=False)
    _cooldown_until: float = field(default=0.0, init=False, repr=False)
    _missed_frames: int = field(default=0, init=False, repr=False)

    def observe(self, x: float, wrist_y: float, now: float) -> bool:
        self._trim_old_samples(now)

        if now < self._cooldown_until:
            if self._is_trackable(wrist_y):
                self._append_sample(now, x)
            return False

        if not self._is_trackable(wrist_y):
            self.mark_missed()
            return False

        self._missed_frames = 0
        self._append_sample(now, x)

        if len(self._samples) < self.min_samples:
            return False

        timestamps = [timestamp for timestamp, _sample_x in self._samples]
        if timestamps[-1] - timestamps[0] + 1e-9 < self.min_span_seconds:
            return False

        values = [sample_x for _timestamp, sample_x in self._samples]
        peak_to_peak = max(values) - min(values)
        path_length = self._path_length(values)
        reversals = self._count_reversals(values)

        if reversals < self.min_reversals:
            return False
        if peak_to_peak + 1e-9 < self.min_peak_to_peak:
            return False
        if path_length + 1e-9 < self.min_path_length:
            return False

        self._cooldown_until = now + self.cooldown_seconds
        self._samples.clear()
        return True

    def _is_trackable(self, wrist_y: float) -> bool:
        # Reject only when the hand is clearly low in the frame.
        # Shoulder-level side waves are allowed; no "above head" requirement.
        return wrist_y < self.max_wrist_y

    def mark_missed(self) -> None:
        self._missed_frames += 1
        if self._missed_frames > self.missed_frame_grace:
            self._samples.clear()

    def reset(self) -> None:
        self._samples.clear()
        self._missed_frames = 0

    def _append_sample(self, now: float, x: float) -> None:
        self._samples.append((now, x))

    def _trim_old_samples(self, now: float) -> None:
        cutoff = now - self.window_seconds
        while self._samples and self._samples[0][0] < cutoff:
            self._samples.popleft()

    def _path_length(self, values: list[float]) -> float:
        return sum(
            abs(current - previous)
            for previous, current in zip(values, values[1:])
        )

    def _count_reversals(self, values: list[float]) -> int:
        directions: list[int] = []
        for previous, current in zip(values, values[1:]):
            delta = current - previous
            if abs(delta) < self.min_delta:
                continue
            directions.append(1 if delta > 0 else -1)

        return sum(
            1
            for previous, current in zip(directions, directions[1:])
            if previous != current
        )
