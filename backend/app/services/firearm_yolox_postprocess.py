"""YOLOX ONNX postprocess (decode_in_inference export) — no Ultralytics."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from app.services.firearm_onnx_postprocess import LetterboxMeta, nms_xyxy


@dataclass(frozen=True)
class YoloxDet:
    label: str
    score: float
    box: list[float]


def letterbox_rgb_yolox(
    rgb: np.ndarray,
    imgsz: int = 416,
    pad_value: int = 114,
) -> tuple[np.ndarray, LetterboxMeta]:
    """YOLOX ValTransform-compatible letterbox.

    Matches Megvii YOLOX ``preproc`` / ``ValTransform`` (not Ultralytics):
    - BGR channel order
    - float32 in **0–255** (no /255)
    - top-left pad (not centered)
    """
    import cv2

    orig_h, orig_w = int(rgb.shape[0]), int(rgb.shape[1])
    # callers pass RGB; YOLOX train/val use cv2 BGR
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    ratio = min(imgsz / max(orig_h, 1), imgsz / max(orig_w, 1))
    new_w = max(1, int(orig_w * ratio))
    new_h = max(1, int(orig_h * ratio))
    resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    canvas = np.ones((imgsz, imgsz, 3), dtype=np.uint8) * int(pad_value)
    canvas[:new_h, :new_w] = resized
    chw = np.ascontiguousarray(canvas.transpose(2, 0, 1), dtype=np.float32)[None, ...]
    meta = LetterboxMeta(
        ratio=float(ratio),
        pad_w=0.0,
        pad_h=0.0,
        orig_w=orig_w,
        orig_h=orig_h,
    )
    return chw, meta


def decode_yolox_onnx_output(
    output: np.ndarray,
    meta: LetterboxMeta,
    conf_thres: float = 0.25,
    iou_thres: float = 0.45,
    class_name: str = "gun",
) -> list[dict[str, Any]]:
    """Decode YOLOX export with ``decode_in_inference=True``.

    Expected shape: (1, N, 5+nc) or (N, 5+nc) with **cxcywh** on the letterboxed
    canvas (YOLOX ``decode_outputs``), objectness, then class scores.
    """
    arr = np.asarray(output)
    if arr.ndim == 3:
        arr = arr[0]
    if arr.ndim != 2 or arr.shape[1] < 6:
        return []

    cxcywh = arr[:, 0:4].astype(np.float32)
    obj = arr[:, 4].astype(np.float32)
    cls = arr[:, 5:].astype(np.float32)
    if cls.ndim == 1:
        cls = cls[:, None]
    cls_ids = np.argmax(cls, axis=1)
    cls_scores = cls[np.arange(cls.shape[0]), cls_ids]
    scores = obj * cls_scores

    keep = scores >= conf_thres
    cxcywh = cxcywh[keep]
    scores = scores[keep]
    if cxcywh.size == 0:
        return []

    # cxcywh → xyxy on letterbox canvas (same as yolox.utils.boxes.postprocess)
    boxes = np.empty_like(cxcywh)
    boxes[:, 0] = cxcywh[:, 0] - cxcywh[:, 2] / 2.0
    boxes[:, 1] = cxcywh[:, 1] - cxcywh[:, 3] / 2.0
    boxes[:, 2] = cxcywh[:, 0] + cxcywh[:, 2] / 2.0
    boxes[:, 3] = cxcywh[:, 1] + cxcywh[:, 3] / 2.0

    # map from letterboxed xyxy → original (top-left pad → pad usually 0)
    boxes[:, [0, 2]] -= meta.pad_w
    boxes[:, [1, 3]] -= meta.pad_h
    boxes /= max(meta.ratio, 1e-6)
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, meta.orig_w)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, meta.orig_h)

    idx = nms_xyxy(boxes, scores, iou_thres)
    out: list[dict[str, Any]] = []
    for i in idx:
        x1, y1, x2, y2 = boxes[i].tolist()
        out.append(
            {
                "label": class_name,
                "score": float(scores[i]),
                "box": [float(x1), float(y1), float(x2), float(y2)],
            }
        )
    return out
