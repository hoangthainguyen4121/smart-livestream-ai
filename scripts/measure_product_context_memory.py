#!/usr/bin/env python3
from __future__ import annotations

import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.product_context_resolver import resolve_product_context  # noqa: E402


REPORT_PATH = ROOT / "docs" / "PRODUCT_CONTEXT_MEMORY_REPORT.md"
CATALOG_PATH = BACKEND_DIR / "tests" / "fixtures" / "sample_catalog.json"
ITERATIONS = 5_000

SAMPLE_COMMENTS = [
    "cái này bao nhiêu?",
    "món này còn hàng không?",
    "áo trắng bao nhiêu?",
    "áo thun trắng còn size M không?",
    "mua cái này",
    "giá bao nhiêu?",
    "son ruby còn màu đen không?",
    "kính urban có thử AR không?",
]


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


def build_report(
    *,
    baseline_rss: int,
    peak_rss: int,
    iterations: int,
    average_ms: float,
    psutil_available: bool,
) -> str:
    delta_mb = mb(peak_rss - baseline_rss)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return f"""# Product Context Memory Report

Generated: {generated_at}

Lightweight benchmark for the product context resolver only. **InsightFace is not measured here.**

## Summary

| Metric | Value |
|--------|-------|
| Baseline RSS | {mb(baseline_rss)} MB |
| Peak RSS | {mb(peak_rss)} MB |
| Delta RSS | {delta_mb} MB |
| Iterations | {iterations:,} |
| Average time / resolution | {average_ms:.4f} ms |
| psutil available | {"yes" if psutil_available else "no (fallback RSS reader used)"} |

## Notes

- Resolver path: `backend/app/services/product_context_resolver.py`
- Catalog fixture: `backend/tests/fixtures/sample_catalog.json`
- Sample comments: {len(SAMPLE_COMMENTS)} deictic, explicit catalog, pinned fallback, and clarification cases
- Suitable for Railway free tier: pure text matching, no ML model load

## Future work

- Visual product recognition from camera frames using lightweight object detection or visual embeddings
- Face recognition remains local/high-memory optional and is out of scope for this benchmark
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

    pinned_ids = ["glasses-a", "lipstick-ruby", None]
    camera_ids = ["glasses-a", None]

    for index in range(ITERATIONS):
        comment = SAMPLE_COMMENTS[index % len(SAMPLE_COMMENTS)]
        pinned_product_id = pinned_ids[index % len(pinned_ids)]
        camera_product_id = camera_ids[index % len(camera_ids)]

        started = time.perf_counter()
        resolve_product_context(
            comment=comment,
            catalog=catalog,
            pinned_product_id=pinned_product_id,
            selected_camera_product_id=camera_product_id,
        )
        durations_ms.append((time.perf_counter() - started) * 1000)

        current_rss = read_rss_bytes()
        peak_rss = max(peak_rss, current_rss)

    average_ms = statistics.mean(durations_ms)
    report = build_report(
        baseline_rss=baseline_rss,
        peak_rss=peak_rss,
        iterations=ITERATIONS,
        average_ms=average_ms,
        psutil_available=psutil_available,
    )
    REPORT_PATH.write_text(report, encoding="utf-8")

    print(report)
    print(f"\nSaved report to {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
