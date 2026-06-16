import time
from collections import deque


class FPSMonitor:
    def __init__(self, window_size: int = 30) -> None:
        self.timestamps: deque[float] = deque(maxlen=window_size)

    def update(self) -> float:
        now = time.perf_counter()
        self.timestamps.append(now)
        return self.average_fps

    @property
    def average_fps(self) -> float:
        if len(self.timestamps) < 2:
            return 0.0

        elapsed = self.timestamps[-1] - self.timestamps[0]
        if elapsed <= 0:
            return 0.0

        return (len(self.timestamps) - 1) / elapsed
