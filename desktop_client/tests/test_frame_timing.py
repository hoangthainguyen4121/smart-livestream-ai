from __future__ import annotations

from desktop_client.pipeline.frame_timing import FrameTimingSmoother, FrameTimingSnapshot


def test_frame_timing_smoother_averages_values() -> None:
    smoother = FrameTimingSmoother(alpha=0.5)
    first = FrameTimingSnapshot(
        camera_ms=10.0,
        tracker_ms=20.0,
        draw_ms=5.0,
        imshow_ms=15.0,
        total_frame_ms=50.0,
        frame_width=640,
        frame_height=480,
    )
    second = FrameTimingSnapshot(
        camera_ms=30.0,
        tracker_ms=40.0,
        draw_ms=15.0,
        imshow_ms=25.0,
        total_frame_ms=110.0,
        frame_width=640,
        frame_height=480,
    )

    snapshot = smoother.update(first)
    assert snapshot.camera_ms == 10.0
    assert snapshot.total_frame_ms == 50.0

    snapshot = smoother.update(second)
    assert snapshot.camera_ms == 20.0
    assert snapshot.tracker_ms == 30.0
    assert snapshot.draw_ms == 10.0
    assert snapshot.imshow_ms == 20.0
    assert snapshot.total_frame_ms == 80.0
