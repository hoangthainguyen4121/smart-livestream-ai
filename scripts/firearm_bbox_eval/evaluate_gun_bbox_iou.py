#!/usr/bin/env python3
"""Firearm detector eval with GT bboxes + IoU matching (primary decision metric).

Replaces frame-level max-score/frame as the decision criterion.
Compares Subh775 ONNX vs Custom YOLOX (optional DINO).

Usage:
  python scripts/firearm_bbox_eval/evaluate_gun_bbox_iou.py
  python scripts/firearm_bbox_eval/evaluate_gun_bbox_iou.py --include-dino
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

POC = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(POC / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from bbox_metrics import (  # noqa: E402
    average_precision_at_iou,
    is_gun_label,
    match_detections,
    summarize_counts,
)

GT_PATH = Path(__file__).resolve().parent / "gun_bbox_gt.json"
OUT_DIR = POC / ".local" / "cv-eval"
DOWNLOADS = Path.home() / "Downloads"
CACHE_ART = Path.home() / ".cache" / "smart-livestream-firearm-yolox" / "artifacts"

DEFAULT_THR = {
    "subh775": 0.65,
    "yolox": 0.02,
    "dino": 0.42,
}


def load_gt(path: Path = GT_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_video(video_file: str) -> Path:
    candidate = DOWNLOADS / video_file
    if candidate.exists():
        return candidate
    # fallback: search Downloads
    hits = list(DOWNLOADS.glob(video_file))
    if hits:
        return hits[0]
    raise FileNotFoundError(video_file)


def grab_rgb(video: Path, t_sec: float) -> np.ndarray:
    cap = cv2.VideoCapture(str(video))
    cap.set(cv2.CAP_PROP_POS_MSEC, t_sec * 1000.0)
    ok, bgr = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"failed frame {video.name} @ {t_sec}")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def filter_gun_preds(
    detections: list[Any],
    *,
    score_thr: float,
) -> tuple[list[list[float]], list[float]]:
    boxes: list[list[float]] = []
    scores: list[float] = []
    for det in detections:
        if hasattr(det, "label"):
            label, score, box = det.label, float(det.score), list(det.box)
        else:
            label, score, box = det["label"], float(det["score"]), list(det["box"])
        if not is_gun_label(str(label)):
            continue
        if score < score_thr:
            continue
        boxes.append([float(v) for v in box[:4]])
        scores.append(score)
    return boxes, scores


def run_subh775(rgb: np.ndarray, thr: float):
    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service

    result = firearm_onnx_detector_service.detect_image_rgb(rgb)
    boxes, scores = filter_gun_preds(result.detections, score_thr=thr)
    return boxes, scores, float(result.inference_ms), float(result.top_score)


def run_yolox(rgb: np.ndarray, thr: float):
    from app.services.firearm_yolox_detector_service import firearm_yolox_detector_service

    result = firearm_yolox_detector_service.detect_image_rgb(rgb)
    boxes, scores = filter_gun_preds(result.detections, score_thr=thr)
    return boxes, scores, float(result.inference_ms), float(result.top_score)


def run_dino(rgb: np.ndarray, thr: float):
    from PIL import Image

    from app.services.weapon_detector_service import weapon_detector_service

    result = weapon_detector_service.detect_image(Image.fromarray(rgb))
    boxes, scores = filter_gun_preds(result.detections, score_thr=thr)
    return boxes, scores, float(result.inference_ms), float(
        max(scores) if scores else 0.0
    )


def eval_model(
    name: str,
    frames: list[dict[str, Any]],
    predict_fn,
    thr: float,
    iou_thr: float,
    examples_dir: Path,
) -> dict[str, Any]:
    tp = fp = fn = 0
    n_frames = 0
    latencies: list[float] = []
    all_scores: list[float] = []
    all_is_tp: list[bool] = []
    n_gt_total = 0
    per_frame: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []

    for fr in frames:
        video = resolve_video(fr["video_file"])
        rgb = grab_rgb(video, float(fr["timestamp_sec"]))
        gt_boxes = [list(map(float, b["xyxy"])) for b in fr.get("boxes", [])]
        n_gt_total += len(gt_boxes)
        pred_boxes, pred_scores, lat_ms, top = predict_fn(rgb, thr)
        latencies.append(lat_ms)
        matched = match_detections(gt_boxes, pred_boxes, pred_scores, iou_thr=iou_thr)
        tp += matched["tp"]
        fp += matched["fp"]
        fn += matched["fn"]
        n_frames += 1

        # AP accumulators: each pred is TP or FP under greedy matching
        for m in matched["matches"]:
            all_scores.append(float(m["score"]))
            all_is_tp.append(m["kind"] == "tp")

        row = {
            "id": fr["id"],
            "timestamp_sec": fr["timestamp_sec"],
            "expected": fr["expected"],
            "note": fr.get("note"),
            "n_gt": len(gt_boxes),
            "n_pred": len(pred_boxes),
            "tp": matched["tp"],
            "fp": matched["fp"],
            "fn": matched["fn"],
            "top_score": round(top, 4),
            "latency_ms": round(lat_ms, 2),
            "pred_scores": [round(s, 4) for s in pred_scores[:12]],
        }
        per_frame.append(row)

        # localization example: save when FP or FN present on positives / hardneg FP
        if matched["fp"] or matched["fn"]:
            if len(examples) < 12:
                examples.append(
                    {
                        **row,
                        "gt_boxes": gt_boxes,
                        "pred_boxes": pred_boxes,
                        "matches": matched["matches"][:20],
                    }
                )
                # draw overlay
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                for g in gt_boxes:
                    cv2.rectangle(
                        bgr,
                        (int(g[0]), int(g[1])),
                        (int(g[2]), int(g[3])),
                        (0, 200, 0),
                        2,
                    )
                for pb, sc in zip(pred_boxes, pred_scores):
                    cv2.rectangle(
                        bgr,
                        (int(pb[0]), int(pb[1])),
                        (int(pb[2]), int(pb[3])),
                        (0, 0, 255),
                        2,
                    )
                    cv2.putText(
                        bgr,
                        f"{sc:.2f}",
                        (int(pb[0]), max(16, int(pb[1]) - 4)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 0, 255),
                        1,
                    )
                out_img = examples_dir / f"{name}_{fr['id']}.jpg"
                cv2.imwrite(str(out_img), bgr)

    summary = summarize_counts(tp, fp, fn)
    ap50 = average_precision_at_iou(all_scores, all_is_tp, n_gt_total)
    avg_fp = fp / n_frames if n_frames else 0.0
    lat_sorted = sorted(latencies)
    p50 = lat_sorted[len(lat_sorted) // 2] if lat_sorted else 0.0
    p95 = lat_sorted[min(len(lat_sorted) - 1, int(round(0.95 * (len(lat_sorted) - 1))))] if lat_sorted else 0.0
    return {
        "model": name,
        "score_threshold": thr,
        "iou_threshold": iou_thr,
        **summary,
        "ap50": ap50,
        "avg_fp_boxes_per_frame": round(avg_fp, 4),
        "n_gt_boxes": n_gt_total,
        "n_frames": n_frames,
        "latency_p50_ms": round(p50, 2),
        "latency_p95_ms": round(p95, 2),
        "per_frame": per_frame,
        "localization_examples": examples,
    }


def decide(results: dict[str, dict[str, Any]]) -> dict[str, str]:
    base = results.get("subh775")
    custom = results.get("yolox")
    if not base or not custom:
        return {
            "decision": "INCOMPLETE",
            "reason": "Need both Subh775 and YOLOX bbox metrics.",
        }
    # Primary: localization F1 + FP-box rate (not frame max-score).
    f1_drop = base["f1"] - custom["f1"]
    fp_worse = custom["avg_fp_boxes_per_frame"] > base["avg_fp_boxes_per_frame"] + 0.25
    if custom["f1"] >= base["f1"] - 0.05 and not fp_worse and custom["ap50"] >= base["ap50"] - 0.05:
        return {
            "decision": "USE CUSTOM YOLOX",
            "reason": (
                f"BBox IoU@0.5: YOLOX F1={custom['f1']} AP50={custom['ap50']} "
                f"avgFP={custom['avg_fp_boxes_per_frame']} vs Subh775 "
                f"F1={base['f1']} AP50={base['ap50']} avgFP={base['avg_fp_boxes_per_frame']}."
            ),
        }
    return {
        "decision": "KEEP BASELINE SUBH775",
        "reason": (
            f"BBox IoU@0.5 favors Subh775 (F1 {base['f1']}→{custom['f1']}, "
            f"AP50 {base['ap50']}→{custom['ap50']}, "
            f"avgFP/frame {base['avg_fp_boxes_per_frame']}→{custom['avg_fp_boxes_per_frame']}; "
            f"F1 drop={f1_drop:.3f}). Frame max-score metrics are not used."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gt", type=Path, default=GT_PATH)
    parser.add_argument("--iou", type=float, default=0.5)
    parser.add_argument("--include-dino", action="store_true")
    parser.add_argument("--yolox-thr", type=float, default=DEFAULT_THR["yolox"])
    parser.add_argument("--subh775-thr", type=float, default=DEFAULT_THR["subh775"])
    parser.add_argument("--dino-thr", type=float, default=DEFAULT_THR["dino"])
    args = parser.parse_args()

    gt = load_gt(args.gt)
    frames = gt["frames"]
    iou_thr = float(args.iou)

    os.environ.setdefault("FIREARM_ONNX_ENABLED", "true")
    os.environ.setdefault(
        "FIREARM_ONNX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-onnx"),
    )
    os.environ["FIREARM_ONNX_CONF"] = "0.01"
    os.environ.setdefault("FIREARM_YOLOX_ENABLED", "true")
    os.environ.setdefault(
        "FIREARM_YOLOX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-yolox" / "artifacts"),
    )
    os.environ["FIREARM_YOLOX_CONF"] = "0.01"
    os.environ["FIREARM_EVIDENCE_CAPTURE"] = "false"

    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service
    from app.services.firearm_yolox_detector_service import firearm_yolox_detector_service

    firearm_onnx_detector_service.reset_for_tests()
    firearm_yolox_detector_service.reset_for_tests()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    examples_dir = OUT_DIR / "bbox_iou_examples"
    examples_dir.mkdir(parents=True, exist_ok=True)
    CACHE_ART.mkdir(parents=True, exist_ok=True)

    print(f"GT frames: {len(frames)}  IoU>={iou_thr}")
    results: dict[str, dict[str, Any]] = {}

    print("Evaluating Subh775...")
    results["subh775"] = eval_model(
        "subh775", frames, run_subh775, args.subh775_thr, iou_thr, examples_dir
    )
    print(
        "  Subh775",
        {k: results["subh775"][k] for k in ("precision", "recall", "f1", "ap50", "avg_fp_boxes_per_frame", "tp", "fp", "fn")},
    )

    print("Evaluating Custom YOLOX...")
    results["yolox"] = eval_model(
        "yolox", frames, run_yolox, args.yolox_thr, iou_thr, examples_dir
    )
    print(
        "  YOLOX",
        {k: results["yolox"][k] for k in ("precision", "recall", "f1", "ap50", "avg_fp_boxes_per_frame", "tp", "fp", "fn")},
    )

    if args.include_dino:
        os.environ.setdefault("WEAPON_DETECTOR_ENABLED", "true")
        os.environ.setdefault(
            "WEAPON_MODEL_CACHE_DIR",
            str(Path.home() / ".cache" / "smart-livestream-weapon"),
        )
        print("Evaluating Grounding DINO...")
        results["dino"] = eval_model(
            "dino", frames, run_dino, args.dino_thr, iou_thr, examples_dir
        )
        print(
            "  DINO",
            {k: results["dino"][k] for k in ("precision", "recall", "f1", "ap50", "avg_fp_boxes_per_frame", "tp", "fp", "fn")},
        )

    decision = decide(results)
    models_out: dict[str, Any] = {}
    for k, v in results.items():
        models_out[k] = {
            kk: vv
            for kk, vv in v.items()
            if kk not in {"localization_examples"}
        }
        models_out[k]["localization_example_count"] = len(v["localization_examples"])
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "protocol": "bbox_iou_v1",
        "iou_threshold": iou_thr,
        "gt_path": str(args.gt),
        "deprecated_metric": "frame_max_score_binary_f1",
        "models": models_out,
        "decision": decision,
        "demo_primary_order": ["subh775", "yolox", "dino"],
        "note": (
            "Decision uses GT-bbox IoU matching. Prior corrected-GT max-score/frame "
            "metrics are INVALID for localization quality."
        ),
    }

    out_path = OUT_DIR / "gun_bbox_iou_compare.json"
    cache_path = CACHE_ART / "gun_bbox_iou_compare.json"
    text = json.dumps(out, indent=2)
    out_path.write_text(text, encoding="utf-8")
    cache_path.write_text(text, encoding="utf-8")
    print(json.dumps(decision, indent=2))
    print("wrote", out_path)
    print("examples", examples_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
