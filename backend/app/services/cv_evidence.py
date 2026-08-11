"""Minimal CV evidence capture for firearm fine-tune / eval inspection.

Writes under POC `.local/cv-evidence/` (gitignored). Not for production storage.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import numpy as np

POC_ROOT = Path(__file__).resolve().parents[3]
EVIDENCE_ROOT = POC_ROOT / ".local" / "cv-evidence"


def evidence_enabled() -> bool:
    return os.getenv("FIREARM_EVIDENCE_CAPTURE", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def save_gun_evidence(
    *,
    rgb: np.ndarray,
    detector: str,
    prediction: str,
    score: float,
    box: list[float] | None,
    timestamp_sec: float | None = None,
    expected: str | None = None,
    video_id: str | None = None,
    note: str | None = None,
) -> Path | None:
    if not evidence_enabled():
        return None
    if prediction != "gun" and (expected is None):
        # default: only persist hits unless expected label provided (eval mode)
        return None

    from PIL import Image

    stamp = time.strftime("%Y%m%d_%H%M%S")
    ms = int(time.time() * 1000) % 1000
    folder = EVIDENCE_ROOT / detector
    folder.mkdir(parents=True, exist_ok=True)
    stem = f"{stamp}_{ms:03d}_{prediction}_{score:.3f}"
    img_path = folder / f"{stem}.jpg"
    meta_path = folder / f"{stem}.json"

    Image.fromarray(rgb).save(img_path, quality=90)
    payload: dict[str, Any] = {
        "detector": detector,
        "prediction": prediction,
        "score": score,
        "box": box,
        "timestamp_sec": timestamp_sec,
        "expected": expected,
        "video_id": video_id,
        "note": note,
        "image": img_path.name,
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return img_path
