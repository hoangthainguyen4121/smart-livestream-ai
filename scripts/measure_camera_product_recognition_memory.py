#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.camera_product_matcher import match_frame_against_catalog  # noqa: E402


REPORT_PATH = ROOT / "docs" / "CAMERA_PRODUCT_RECOGNITION_MEMORY_REPORT.md"
CATALOG_PATH = BACKEND_DIR / "tests" / "fixtures" / "sample_catalog.json"
FRAMES_TESTED = 120
PRODUCT_CONTEXT_BASELINE_MB = 0.29


def read_rss_bytes() -> int:
    try:
        import psutil

        return psutil.Process().memory_info().rss
    except ImportError:
        if sys.platform == "win32":
            import ctypes

            class ProcessMemoryCounters(ctypes.Structure):
                _fields_ = [
                    ("cb", ctypes.c_ulong),
                    ("PageFaultCount", ctypes.c_ulong),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            counters = ProcessMemoryCounters()
            counters.cb = ctypes.sizeof(ProcessMemoryCounters)
            ctypes.windll.psapi.GetProcessMemoryInfo(
                ctypes.windll.kernel32.GetCurrentProcess(),
                ctypes.byref(counters),
                counters.cb,
            )
            return int(counters.WorkingSetSize)

        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        return int(usage.ru_maxrss * 1024)


def mb(value_bytes: int) -> float:
    return round(value_bytes / (1024 * 1024), 2)


def encode_synthetic_frame(red: int, green: int, blue: int) -> str:
    image = np.full((128, 128, 3), (blue, green, red), dtype=np.uint8)
    success, encoded = cv2.imencode(".png", image)
    if not success:
        raise RuntimeError("Unable to encode synthetic frame.")
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def build_report(
    *,
    baseline_rss: int,
    peak_rss: int,
    average_ms: float,
    catalog_count: int,
    frames_tested: int,
    psutil_available: bool,
) -> str:
    delta_mb = mb(peak_rss - baseline_rss)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return f"""# Camera Product Recognition Memory Report

Generated: {generated_at}

Lightweight catalog-scoped camera product recognition benchmark. **InsightFace / face recognition are not measured here.**

## Summary

| Metric | Value |
|--------|-------|
| Baseline RSS | {mb(baseline_rss)} MB |
| Peak RSS | {mb(peak_rss)} MB |
| Delta RSS | {delta_mb} MB |
| Catalog products tested | {catalog_count} |
| Frames tested | {frames_tested} |
| Average recognition time | {average_ms:.4f} ms |
| psutil available | {"yes" if psutil_available else "no (fallback RSS reader used)"} |

## Comparison

| Feature | Delta RSS |
|---------|-----------|
| Product context resolver | ~{PRODUCT_CONTEXT_BASELINE_MB} MB |
| Camera product recognition | {delta_mb} MB |

## Notes

- Matcher path: `backend/app/services/camera_product_matcher.py`
- Catalog fixture: `backend/tests/fixtures/sample_catalog.json`
- Uses dHash + color histogram against catalog product images only
- Feature flags default to **disabled** on Railway/cloud:
  - `VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION=false`
  - `CAMERA_PRODUCT_RECOGNITION_ENABLED=false`

## Future work

- Replace lightweight matcher with YOLO / CLIP / visual embeddings behind explicit feature flags
- Face recognition remains optional/high-memory and out of scope for this benchmark
"""


def main() -> int:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    psutil_available = True
    try:
        import psutil  # noqa: F401
    except ImportError:
        psutil_available = False

    baseline_rss = read_rss_bytes()
    peak_rss = baseline_rss
    durations_ms: list[float] = []

    palette = [
        (210, 25, 25),
        (20, 20, 180),
        (120, 120, 120),
        (240, 240, 240),
    ]

    for index in range(FRAMES_TESTED):
        red, green, blue = palette[index % len(palette)]
        frame_base64 = encode_synthetic_frame(red, green, blue)
        started = time.perf_counter()
        match_frame_against_catalog(frame_base64, catalog)
        durations_ms.append((time.perf_counter() - started) * 1000)
        peak_rss = max(peak_rss, read_rss_bytes())

    report = build_report(
        baseline_rss=baseline_rss,
        peak_rss=peak_rss,
        average_ms=statistics.mean(durations_ms),
        catalog_count=len(catalog),
        frames_tested=FRAMES_TESTED,
        psutil_available=psutil_available,
    )
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nSaved report to {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
