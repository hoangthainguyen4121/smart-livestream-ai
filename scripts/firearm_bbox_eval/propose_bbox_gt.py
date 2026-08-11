#!/usr/bin/env python3
"""Propose gun bbox GT drafts from Subh775 (human-curated afterward)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

POC = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(POC / "backend"))

DOWNLOADS = Path.home() / "Downloads"
OUT = Path.home() / ".cache" / "smart-livestream-firearm-yolox" / "bbox_gt_draft"
OUT.mkdir(parents=True, exist_ok=True)

GUN = DOWNLOADS / (
    "YTDown.com_YouTube_Guns-cheaper-than-smartphones-in-Pakista_Media_MpzrIL5p16U_001_720p.mp4"
)
BREATHLESS = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-Breathless-Video_Media_3HbKnQxd0_E_001_480p.mp4"
)
NO_PROMISES = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-No-Promises-Video_Media_HLphrgQFHUQ_001_480p.mp4"
)

# Sparse positive + hard-neg set for localization eval (not the full frame-level list).
FRAMES: list[tuple[Path, float, str, str]] = [
    (GUN, 8.0, "positive", "handheld cluster"),
    (GUN, 10.0, "positive", "handheld cluster"),
    (GUN, 14.0, "positive", "display cluster"),
    (GUN, 15.0, "positive", "display / handheld"),
    (GUN, 16.0, "positive", "handheld SMG"),
    (GUN, 25.0, "positive", "later gun"),
    (GUN, 35.0, "positive", "outdoor rifle"),
    (GUN, 43.0, "positive", "rack"),
    (BREATHLESS, 104.0, "negative", "hardneg face ~01:44"),
    (BREATHLESS, 104.4, "negative", "hardneg face peak"),
    (BREATHLESS, 177.0, "negative", "close-up face"),
    (NO_PROMISES, 10.0, "negative", "benign music"),
]


def main() -> int:
    os.environ["FIREARM_ONNX_ENABLED"] = "true"
    os.environ.setdefault(
        "FIREARM_ONNX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-onnx"),
    )
    os.environ["FIREARM_ONNX_CONF"] = "0.25"  # draft proposals
    os.environ["FIREARM_EVIDENCE_CAPTURE"] = "false"

    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service

    firearm_onnx_detector_service.reset_for_tests()
    records = []
    for path, t, expected, note in FRAMES:
        if not path.exists():
            print("MISSING", path)
            continue
        cap = cv2.VideoCapture(str(path))
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, bgr = cap.read()
        cap.release()
        if not ok:
            print("FAIL", path.name, t)
            continue
        h, w = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = firearm_onnx_detector_service.detect_image_rgb(rgb)
        boxes = []
        vis = bgr.copy()
        for det in result.detections:
            if det.label.lower() not in {"gun", "pistol", "rifle", "firearm"}:
                continue
            x1, y1, x2, y2 = [float(v) for v in det.box]
            boxes.append(
                {
                    "label": "gun",
                    "xyxy": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    "source": "subh775_proposal",
                    "proposal_score": round(float(det.score), 4),
                }
            )
            cv2.rectangle(vis, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)
            cv2.putText(
                vis,
                f"{det.score:.2f}",
                (int(x1), max(20, int(y1) - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2,
            )
        stem = f"{path.stem[:40]}_{t:.1f}".replace(".", "p")
        preview = OUT / f"{stem}.jpg"
        cv2.imwrite(str(preview), vis)
        # also save clean frame for manual correction
        clean = OUT / f"{stem}_clean.jpg"
        cv2.imwrite(str(clean), bgr)
        rec = {
            "video_file": path.name,
            "timestamp_sec": t,
            "expected": expected,
            "note": note,
            "image_width": w,
            "image_height": h,
            "boxes": boxes if expected == "positive" else [],
            "preview": str(preview),
            "clean_frame": str(clean),
        }
        records.append(rec)
        print(
            f"{path.name[:30]} t={t} exp={expected} proposals={len(boxes)} "
            f"top={result.top_score:.3f} -> {preview.name}"
        )

    draft = {
        "version": 1,
        "iou_eval_note": "DRAFT — curate boxes before trusting metrics",
        "frames": records,
    }
    out_json = OUT / "gun_bbox_gt_draft.json"
    out_json.write_text(json.dumps(draft, indent=2), encoding="utf-8")
    print("wrote", out_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
