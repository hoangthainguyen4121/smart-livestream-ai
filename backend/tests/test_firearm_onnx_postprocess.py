"""Unit tests for YOLOv8 ONNX decode (no weights)."""

from __future__ import annotations

import numpy as np

from app.services.firearm_onnx_postprocess import (
    LetterboxMeta,
    decode_yolov8_output,
    letterbox_rgb,
    nms_xyxy,
    xywh_to_xyxy,
)


def test_xywh_to_xyxy_and_nms():
    xywh = np.array([[50.0, 50.0, 20.0, 20.0], [52.0, 52.0, 20.0, 20.0]], dtype=np.float32)
    boxes = xywh_to_xyxy(xywh)
    scores = np.array([0.9, 0.8], dtype=np.float32)
    keep = nms_xyxy(boxes, scores, iou_thres=0.5)
    assert keep == [0]


def test_letterbox_shape():
    rgb = np.zeros((240, 320, 3), dtype=np.uint8)
    tensor, meta = letterbox_rgb(rgb, imgsz=640)
    assert tensor.shape == (1, 3, 640, 640)
    assert meta.orig_w == 320
    assert meta.orig_h == 240


def test_decode_single_class_channels_first():
    # Fake (1, 5, N): cx,cy,w,h,score — one strong box near center of 640 canvas.
    n = 4
    raw = np.zeros((1, 5, n), dtype=np.float32)
    raw[0, :, 0] = [320, 320, 100, 80, 0.91]
    raw[0, :, 1] = [10, 10, 20, 20, 0.2]
    meta = LetterboxMeta(ratio=1.0, pad_w=0.0, pad_h=0.0, orig_w=640, orig_h=640)
    dets = decode_yolov8_output(raw, meta, conf_thres=0.4, iou_thres=0.45)
    assert len(dets) == 1
    label, score, box = dets[0]
    assert label == "gun"
    assert score >= 0.9
    assert box[2] > box[0] and box[3] > box[1]
