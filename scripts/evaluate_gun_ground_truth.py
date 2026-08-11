"""Corrected Firearm ONNX eval with timestamp-bound ground truth (FRAME-LEVEL).

Previous A/B/eval metrics that used preset expected without timestamp match are INVALID.
Does not commit media. Writes .local/cv-eval/gun_gt_results.json

NOTE: max-score/frame binary F1 is NOT valid for object-detector localization.
For TP/FP/FN with GT bboxes + IoU, use:
  scripts/firearm_bbox_eval/evaluate_gun_bbox_iou.py
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

POC_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POC_ROOT / "backend"))

OUT_DIR = POC_ROOT / ".local" / "cv-eval"
THRESHOLDS = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]

DOWNLOADS = Path.home() / "Downloads"
GUN_VIDEO = DOWNLOADS / (
    "YTDown.com_YouTube_Guns-cheaper-than-smartphones-in-Pakista_Media_MpzrIL5p16U_001_720p.mp4"
)
BREATHLESS = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-Breathless-Video_Media_3HbKnQxd0_E_001_480p.mp4"
)
NO_PROMISES = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-No-Promises-Video_Media_HLphrgQFHUQ_001_480p.mp4"
)

# Explicit annotations: (video_path, t_sec, expected, expected_source, note)
# Positives: gun video frames previously confirmed as gun-present domain (MpzrIL5p16U).
# Negatives include Breathless ~01:44 hard-neg (manual evidence gun≈0.80 on face).
ANNOTATIONS: list[tuple[Path, float, str, str, str]] = [
    # --- positives (gun video) ---
    (GUN_VIDEO, 7.5, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 8.0, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 8.5, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 9.0, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 9.5, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 10.0, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 10.5, "positive", "annotated_gun_video", "handheld cluster"),
    (GUN_VIDEO, 13.0, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 13.5, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 14.0, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 14.5, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 15.0, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 15.5, "positive", "annotated_gun_video", "display cluster"),
    (GUN_VIDEO, 20.0, "positive", "annotated_gun_video", "later gun"),
    (GUN_VIDEO, 25.0, "positive", "annotated_gun_video", "later gun"),
    # --- hard negatives: Breathless ~01:44 (dense peaks from offline scan) ---
    # Sparse integer seeks can miss FP peaks; include verified high-score face/person frames.
    (BREATHLESS, 101.2, "negative", "manual_hard_neg_breathless_0144", "face/person peak near 01:44"),
    (BREATHLESS, 102.4, "negative", "manual_hard_neg_breathless_0144", "face/person peak near 01:44"),
    (BREATHLESS, 104.0, "negative", "manual_hard_neg_breathless_0144", "01:44 nominal"),
    (BREATHLESS, 104.4, "negative", "manual_hard_neg_breathless_0144", "face/person peak @01:44.4"),
    (BREATHLESS, 104.8, "negative", "manual_hard_neg_breathless_0144", "near 01:44"),
    (BREATHLESS, 105.0, "negative", "manual_hard_neg_breathless_0144", "near 01:44"),
    (BREATHLESS, 177.0, "negative", "annotated_breathless_face", "close-up face"),
    (BREATHLESS, 180.0, "negative", "annotated_breathless_face", "close-up face"),
    (BREATHLESS, 183.0, "negative", "annotated_breathless_face", "close-up face"),
    (BREATHLESS, 210.0, "negative", "annotated_breathless_face", "late face"),
    (BREATHLESS, 216.0, "negative", "annotated_breathless_face", "late face"),
    (BREATHLESS, 30.0, "negative", "annotated_breathless_body", "body mid"),
    (BREATHLESS, 60.0, "negative", "annotated_breathless_body", "body mid"),
    (BREATHLESS, 80.0, "negative", "annotated_breathless_body", "body mid"),
    (BREATHLESS, 120.0, "negative", "annotated_breathless_body", "body mid"),
    # --- benign music / people ---
    (NO_PROMISES, 1.0, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 5.0, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 10.0, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 24.5, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 37.0, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 20.0, "negative", "annotated_benign_music", "no gun"),
    (NO_PROMISES, 40.0, "negative", "annotated_benign_music", "no gun"),
]


@dataclass
class Row:
    video_id: str
    timestamp_sec: float
    expected: str
    expected_source: str
    note: str
    max_score: float
    latency_ms: float


def solid_negatives() -> list[tuple[str, np.ndarray]]:
    out: list[tuple[str, np.ndarray]] = []
    for name, color in [("solid_black", (20, 20, 20)), ("solid_gray", (120, 120, 120))]:
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:] = color
        out.append((name, img))
    phone = np.full((480, 640, 3), 180, dtype=np.uint8)
    cv2.rectangle(phone, (220, 80), (420, 400), (40, 40, 40), -1)
    out.append(("synthetic_phone", phone))
    banana = np.full((480, 640, 3), 40, dtype=np.uint8)
    cv2.ellipse(banana, (320, 240), (180, 50), 25, 0, 360, (0, 220, 240), -1)
    out.append(("synthetic_banana", banana))
    drill = np.full((480, 640, 3), 60, dtype=np.uint8)
    cv2.rectangle(drill, (180, 200), (460, 260), (30, 30, 30), -1)
    out.append(("synthetic_drill", drill))
    return out


def metrics(rows: list[Row], thr: float) -> dict[str, Any]:
    tp = fp = tn = fn = 0
    for r in rows:
        pred = r.max_score >= thr
        pos = r.expected == "positive"
        if pred and pos:
            tp += 1
        elif pred and not pos:
            fp += 1
        elif (not pred) and pos:
            fn += 1
        else:
            tn += 1
    p = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * p * rec / (p + rec)) if p + rec else 0.0
    return {
        "threshold": thr,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": round(p, 4),
        "recall": round(rec, 4),
        "f1": round(f1, 4),
    }


def decide(sweep: list[dict[str, Any]], rows: list[Row]) -> dict[str, Any]:
    pos = sorted(r.max_score for r in rows if r.expected == "positive")
    neg = sorted(r.max_score for r in rows if r.expected == "negative")
    hard = [r for r in rows if "breathless_0144" in r.expected_source]
    hard_scores = sorted(r.max_score for r in hard)

    pos_p50 = pos[len(pos) // 2] if pos else 0.0
    pos_p20 = pos[max(0, len(pos) // 5)] if pos else 0.0
    neg_max = neg[-1] if neg else 0.0
    hard_max = hard_scores[-1] if hard_scores else 0.0

    # Overlap: no-gun FP scores sit in the same band as true guns → threshold cannot separate.
    hard_overlap = hard_max >= 0.65 and pos_p50 > 0 and hard_max >= pos_p50 - 0.20
    global_overlap = neg_max >= 0.65 and pos_p50 > 0 and neg_max >= pos_p20
    overlap = hard_overlap or global_overlap

    usable = [
        m
        for m in sweep
        if m["recall"] >= 0.70 and m["fp"] <= 1 and m["precision"] >= 0.85
    ]
    if usable and not overlap:
        best = max(usable, key=lambda m: m["f1"])
        return {
            "decision": "CALIBRATION SUFFICIENT",
            "best": best,
            "overlap_hardneg_with_pos": overlap,
            "pos_p50": round(pos_p50, 4),
            "pos_p20": round(pos_p20, 4),
            "neg_max": round(neg_max, 4),
            "breathless_0144_max": round(hard_max, 4),
        }

    best = max(sweep, key=lambda m: (m["f1"], m["recall"], -m["fp"]))
    reason = "Corrected GT has no threshold meeting recall/FP targets."
    if hard_overlap:
        reason = (
            f"Breathless~01:44 hard-neg max={hard_max:.3f} overlaps gun pos_p50={pos_p50:.3f}; "
            "threshold tuning cannot fix face/person FP — hard-negative fine-tune required."
        )
    elif global_overlap:
        reason = (
            f"No-gun neg_max={neg_max:.3f} overlaps gun score band (pos_p20={pos_p20:.3f}, "
            f"pos_p50={pos_p50:.3f}); calibration insufficient."
        )
    return {
        "decision": "FINE-TUNE REQUIRED",
        "best": best,
        "overlap_hardneg_with_pos": overlap,
        "pos_p50": round(pos_p50, 4),
        "pos_p20": round(pos_p20, 4),
        "neg_max": round(neg_max, 4),
        "breathless_0144_max": round(hard_max, 4),
        "reason": reason,
    }


def main() -> int:
    os.environ.setdefault("FIREARM_ONNX_ENABLED", "true")
    os.environ.setdefault(
        "FIREARM_ONNX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-onnx"),
    )
    os.environ["FIREARM_ONNX_CONF"] = "0.01"

    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[Row] = []

    print("Warm Firearm ONNX...")
    firearm_onnx_detector_service.detect_image_rgb(np.zeros((480, 640, 3), dtype=np.uint8))

    for path, t, expected, source, note in ANNOTATIONS:
        if not path.exists():
            print("MISSING", path)
            continue
        cap = cv2.VideoCapture(str(path))
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, bgr = cap.read()
        cap.release()
        if not ok:
            print("FAIL_FRAME", path.name, t)
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = firearm_onnx_detector_service.detect_image_rgb(rgb)
        rows.append(
            Row(
                video_id=path.name,
                timestamp_sec=t,
                expected=expected,
                expected_source=source,
                note=note,
                max_score=float(result.top_score),
                latency_ms=float(result.inference_ms),
            )
        )
        print(
            f"{expected:8} {path.name[:28]:28} t={t:6.1f} score={result.top_score:.3f} src={source}"
        )

    for name, bgr in solid_negatives():
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        result = firearm_onnx_detector_service.detect_image_rgb(rgb)
        rows.append(
            Row(
                video_id=name,
                timestamp_sec=0.0,
                expected="negative",
                expected_source="synthetic_hard_neg",
                note=name,
                max_score=float(result.top_score),
                latency_ms=float(result.inference_ms),
            )
        )
        print(f"negative  {name:28} t={0:6.1f} score={result.top_score:.3f}")

    sweep = [metrics(rows, thr) for thr in THRESHOLDS]
    pick = decide(sweep, rows)

    breathless = [r for r in rows if "0144" in r.expected_source]
    breathless_max = max(breathless, key=lambda r: r.max_score) if breathless else None

    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "previous_gun_metrics_valid": False,
        "previous_metrics_note": (
            "INVALID: A/B harness used preset.expected without timestamp match "
            "(e.g. gun_015@01:44 labeled gun_present). Also prior evaluate_cv_accuracy "
            "positives were time-sampled without per-frame GT binding."
        ),
        "harness_label_bug": True,
        "rows": [asdict(r) for r in rows],
        "sweep": sweep,
        "pick": pick,
        "breathless_0144": {
            "expected": "no_gun",
            "max_score": breathless_max.max_score if breathless_max else None,
            "timestamp_sec": breathless_max.timestamp_sec if breathless_max else None,
            "prediction_at_0_65": (
                "gun" if breathless_max and breathless_max.max_score >= 0.65 else "miss"
            ),
            "ui_manual_evidence_score": 0.804,
            "note": (
                "Offline dense seek peak may be ~0.72; browser canvas frame at ~01:44 "
                "reported gun≈0.804 — both are hard-neg FPs in gun score band."
            ),
        },
        "invalidated_prior_metrics": {
            "precision": 0.81,
            "recall": 0.65,
            "f1": 0.72,
            "status": "INVALID",
        },
    }

    json_path = OUT_DIR / "gun_gt_results.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    csv_path = OUT_DIR / "gun_gt_results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(
            fh,
            fieldnames=[
                "video_id",
                "timestamp_sec",
                "expected",
                "expected_source",
                "note",
                "max_score",
                "latency_ms",
            ],
        )
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))

    print("\n=== SWEEP ===")
    for m in sweep:
        print(
            f"thr={m['threshold']:.2f} TP={m['tp']} FP={m['fp']} FN={m['fn']} TN={m['tn']} "
            f"P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f}"
        )
    print("\n=== DECISION ===")
    print(json.dumps(pick, indent=2))
    print("Wrote", json_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
