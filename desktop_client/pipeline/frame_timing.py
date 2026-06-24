from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FrameTimingSnapshot:
    camera_ms: float
    tracker_ms: float
    draw_ms: float
    imshow_ms: float
    total_frame_ms: float
    frame_width: int
    frame_height: int


class FrameTimingSmoother:
    """Exponential moving average for per-stage frame timings shown in the debug overlay."""

    def __init__(self, alpha: float = 0.12) -> None:
        self.alpha = alpha
        self._camera_ms = 0.0
        self._tracker_ms = 0.0
        self._draw_ms = 0.0
        self._imshow_ms = 0.0
        self._total_frame_ms = 0.0
        self._initialized = False

    def update(self, snapshot: FrameTimingSnapshot) -> FrameTimingSnapshot:
        if not self._initialized:
            self._camera_ms = snapshot.camera_ms
            self._tracker_ms = snapshot.tracker_ms
            self._draw_ms = snapshot.draw_ms
            self._imshow_ms = snapshot.imshow_ms
            self._total_frame_ms = snapshot.total_frame_ms
            self._initialized = True
        else:
            blend = self.alpha
            keep = 1.0 - blend
            self._camera_ms = snapshot.camera_ms * blend + self._camera_ms * keep
            self._tracker_ms = snapshot.tracker_ms * blend + self._tracker_ms * keep
            self._draw_ms = snapshot.draw_ms * blend + self._draw_ms * keep
            self._imshow_ms = snapshot.imshow_ms * blend + self._imshow_ms * keep
            self._total_frame_ms = snapshot.total_frame_ms * blend + self._total_frame_ms * keep

        return FrameTimingSnapshot(
            camera_ms=self._camera_ms,
            tracker_ms=self._tracker_ms,
            draw_ms=self._draw_ms,
            imshow_ms=self._imshow_ms,
            total_frame_ms=self._total_frame_ms,
            frame_width=snapshot.frame_width,
            frame_height=snapshot.frame_height,
        )
