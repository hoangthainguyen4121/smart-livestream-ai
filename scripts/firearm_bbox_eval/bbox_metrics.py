"""Bbox IoU matching metrics for firearm detectors (not frame max-score)."""

from __future__ import annotations

from typing import Any


GUN_LABELS = frozenset({"gun", "pistol", "rifle", "firearm", "weapon"})


def box_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return float(inter / union) if union > 0 else 0.0


def is_gun_label(label: str) -> bool:
    return (label or "").strip().lower() in GUN_LABELS


def match_detections(
    gt_boxes: list[list[float]],
    pred_boxes: list[list[float]],
    pred_scores: list[float],
    *,
    iou_thr: float = 0.5,
) -> dict[str, Any]:
    """Greedy score-descending matching. One-to-one GT↔pred.

    Returns TP/FP/FN counts and match details.
    """
    order = sorted(range(len(pred_boxes)), key=lambda i: pred_scores[i], reverse=True)
    gt_used = [False] * len(gt_boxes)
    matches: list[dict[str, Any]] = []
    fp_idxs: list[int] = []
    tp = 0
    for pi in order:
        best_iou = 0.0
        best_g = -1
        for gi, gbox in enumerate(gt_boxes):
            if gt_used[gi]:
                continue
            iou = box_iou(pred_boxes[pi], gbox)
            if iou > best_iou:
                best_iou = iou
                best_g = gi
        if best_g >= 0 and best_iou >= iou_thr:
            gt_used[best_g] = True
            tp += 1
            matches.append(
                {
                    "pred_idx": pi,
                    "gt_idx": best_g,
                    "iou": round(best_iou, 4),
                    "score": float(pred_scores[pi]),
                    "kind": "tp",
                }
            )
        else:
            fp_idxs.append(pi)
            matches.append(
                {
                    "pred_idx": pi,
                    "gt_idx": None,
                    "iou": round(best_iou, 4),
                    "score": float(pred_scores[pi]),
                    "kind": "fp",
                }
            )
    fn_idxs = [i for i, used in enumerate(gt_used) if not used]
    fp = len(fp_idxs)
    fn = len(fn_idxs)
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "matches": matches,
        "fp_idxs": fp_idxs,
        "fn_idxs": fn_idxs,
    }


def summarize_counts(tp: int, fp: int, fn: int) -> dict[str, float | int]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def average_precision_at_iou(
    all_scores: list[float],
    all_is_tp: list[bool],
    n_gt: int,
) -> float:
    """VOC-style AP from ranked predictions (continuous area under PR)."""
    if n_gt <= 0:
        return 0.0 if any(all_is_tp) else 1.0
    order = sorted(range(len(all_scores)), key=lambda i: all_scores[i], reverse=True)
    tp_cum = 0
    fp_cum = 0
    recalls: list[float] = []
    precisions: list[float] = []
    for i in order:
        if all_is_tp[i]:
            tp_cum += 1
        else:
            fp_cum += 1
        recalls.append(tp_cum / n_gt)
        precisions.append(tp_cum / (tp_cum + fp_cum))
    # make precision monotonically non-increasing from the right
    for i in range(len(precisions) - 2, -1, -1):
        precisions[i] = max(precisions[i], precisions[i + 1])
    ap = 0.0
    prev_r = 0.0
    for p, r in zip(precisions, recalls):
        ap += p * max(0.0, r - prev_r)
        prev_r = r
    return round(float(ap), 4)
