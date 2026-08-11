"""Unit tests for bbox IoU matching (no model weights)."""

from __future__ import annotations

from bbox_metrics import (
    average_precision_at_iou,
    box_iou,
    match_detections,
    summarize_counts,
)


def test_box_iou_identical():
    b = [10.0, 10.0, 50.0, 50.0]
    assert abs(box_iou(b, b) - 1.0) < 1e-6


def test_box_iou_no_overlap():
    assert box_iou([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0


def test_match_tp_fp_fn():
    gt = [[0, 0, 100, 100], [200, 200, 300, 300]]
    preds = [[5, 5, 95, 95], [400, 400, 450, 450]]  # TP + FP
    scores = [0.9, 0.8]
    m = match_detections(gt, preds, scores, iou_thr=0.5)
    assert m["tp"] == 1
    assert m["fp"] == 1
    assert m["fn"] == 1


def test_unmatched_pred_is_fp_on_negative():
    m = match_detections([], [[10, 10, 40, 40]], [0.99], iou_thr=0.5)
    assert m["tp"] == 0 and m["fp"] == 1 and m["fn"] == 0


def test_summarize_and_ap():
    s = summarize_counts(3, 1, 1)
    assert s["precision"] == 0.75
    assert s["recall"] == 0.75
    ap = average_precision_at_iou([0.9, 0.8, 0.1], [True, True, False], n_gt=2)
    assert ap > 0.9
