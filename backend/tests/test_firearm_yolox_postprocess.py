"""YOLOX ONNX decode smoke tests."""

from __future__ import annotations

import numpy as np

from app.services.firearm_yolox_postprocess import (
    decode_yolox_onnx_output,
    letterbox_rgb_yolox,
)


def test_letterbox_yolox_shape():
    rgb = np.zeros((240, 320, 3), dtype=np.uint8)
    rgb[:, :, 0] = 200  # red channel
    chw, meta = letterbox_rgb_yolox(rgb, imgsz=416)
    assert chw.shape == (1, 3, 416, 416)
    assert meta.orig_w == 320
    assert meta.orig_h == 240
    assert meta.pad_w == 0.0 and meta.pad_h == 0.0
    # YOLOX: 0–255 float, BGR (red → channel 2), top-left content
    assert float(chw.max()) > 1.0
    assert float(chw[0, 2, 0, 0]) == 200.0
    assert float(chw[0, 0, 0, 0]) == 0.0
    # bottom-right pad value
    assert float(chw[0, 0, 415, 415]) == 114.0


def test_decode_empty():
    meta_rgb = np.zeros((480, 640, 3), dtype=np.uint8)
    _, meta = letterbox_rgb_yolox(meta_rgb, imgsz=416)
    out = decode_yolox_onnx_output(np.zeros((1, 10, 6), dtype=np.float32), meta, conf_thres=0.5)
    assert out == []


def test_decode_one_hit():
    rgb = np.zeros((480, 640, 3), dtype=np.uint8)
    _, meta = letterbox_rgb_yolox(rgb, imgsz=416)
    # cxcywh on letterbox canvas + obj + cls (YOLOX decode_outputs)
    arr = np.zeros((1, 1, 6), dtype=np.float32)
    arr[0, 0] = [150, 150, 100, 100, 0.9, 0.95]
    out = decode_yolox_onnx_output(arr, meta, conf_thres=0.5)
    assert len(out) == 1
    assert out[0]["label"] == "gun"
    assert out[0]["score"] > 0.8
    x1, y1, x2, y2 = out[0]["box"]
    assert x2 > x1 and y2 > y1
