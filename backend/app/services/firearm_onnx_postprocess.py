"""YOLOv8-style ONNX postprocess (no ultralytics dependency)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class LetterboxMeta:
    ratio: float
    pad_w: float
    pad_h: float
    orig_w: int
    orig_h: int


def letterbox_rgb(
    rgb: np.ndarray,
    imgsz: int = 640,
    pad_value: int = 114,
) -> tuple[np.ndarray, LetterboxMeta]:
    """Resize+pad HxWx3 uint8 RGB to imgsz×imgsz; return CHW float32 [0,1] batch."""
    orig_h, orig_w = int(rgb.shape[0]), int(rgb.shape[1])
    ratio = min(imgsz / max(orig_w, 1), imgsz / max(orig_h, 1))
    new_w = max(1, int(round(orig_w * ratio)))
    new_h = max(1, int(round(orig_h * ratio)))
    pad_w = (imgsz - new_w) / 2.0
    pad_h = (imgsz - new_h) / 2.0

    from PIL import Image

    resized = Image.fromarray(rgb).resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new("RGB", (imgsz, imgsz), (pad_value, pad_value, pad_value))
    canvas.paste(resized, (int(round(pad_w)), int(round(pad_h))))
    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    chw = np.transpose(arr, (2, 0, 1))[None, ...]
    meta = LetterboxMeta(
        ratio=ratio,
        pad_w=pad_w,
        pad_h=pad_h,
        orig_w=orig_w,
        orig_h=orig_h,
    )
    return chw, meta


def xywh_to_xyxy(xywh: np.ndarray) -> np.ndarray:
    out = np.empty_like(xywh)
    out[:, 0] = xywh[:, 0] - xywh[:, 2] / 2.0
    out[:, 1] = xywh[:, 1] - xywh[:, 3] / 2.0
    out[:, 2] = xywh[:, 0] + xywh[:, 2] / 2.0
    out[:, 3] = xywh[:, 1] + xywh[:, 3] / 2.0
    return out


def nms_xyxy(boxes: np.ndarray, scores: np.ndarray, iou_thres: float) -> list[int]:
    if boxes.size == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        union = areas[i] + areas[rest] - inter
        iou = np.where(union > 0, inter / union, 0.0)
        order = rest[iou <= iou_thres]
    return keep


def scale_boxes_to_original(xyxy: np.ndarray, meta: LetterboxMeta) -> np.ndarray:
    out = xyxy.copy()
    out[:, [0, 2]] -= meta.pad_w
    out[:, [1, 3]] -= meta.pad_h
    out[:, :4] /= max(meta.ratio, 1e-9)
    out[:, [0, 2]] = out[:, [0, 2]].clip(0, meta.orig_w)
    out[:, [1, 3]] = out[:, [1, 3]].clip(0, meta.orig_h)
    return out


def decode_yolov8_output(
    raw: np.ndarray,
    meta: LetterboxMeta,
    *,
    conf_thres: float = 0.40,
    iou_thres: float = 0.45,
    max_det: int = 20,
) -> list[tuple[str, float, list[float]]]:
    """Decode YOLOv8 ONNX output → list of (label, score, xyxy).

    Accepts (1, 4+nc, N) or (1, N, 4+nc). Single-class firearm models use nc=1 → Gun.
    """
    arr = np.asarray(raw)
    if arr.ndim == 3 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim != 2:
        raise ValueError(f"unexpected_onnx_output_shape: {getattr(raw, 'shape', None)}")

    # Ultralytics export is usually (4+nc, N). If first dim looks like channels (<=84),
    # transpose to (N, 4+nc) even when N is small (unit tests / tiny exports).
    if arr.shape[0] <= 84:
        preds = arr.T
    else:
        preds = arr

    if preds.shape[1] < 5:
        raise ValueError(f"unexpected_onnx_pred_dims: {preds.shape}")

    boxes_xywh = preds[:, :4]
    class_scores = preds[:, 4:]
    if class_scores.shape[1] == 1:
        scores = class_scores[:, 0]
        class_ids = np.zeros(scores.shape[0], dtype=np.int32)
    else:
        class_ids = np.argmax(class_scores, axis=1)
        scores = class_scores[np.arange(class_scores.shape[0]), class_ids]

    mask = scores >= conf_thres
    boxes_xywh = boxes_xywh[mask]
    scores = scores[mask]
    class_ids = class_ids[mask]
    if boxes_xywh.size == 0:
        return []

    boxes = xywh_to_xyxy(boxes_xywh)
    keep = nms_xyxy(boxes, scores, iou_thres)[:max_det]
    boxes = scale_boxes_to_original(boxes[keep], meta)
    scores = scores[keep]
    class_ids = class_ids[keep]

    # Subh775 Firearm_Detection_Yolov8n: single class "Gun".
    label_names = {0: "gun"}
    out: list[tuple[str, float, list[float]]] = []
    for box, score, cls_id in zip(boxes, scores, class_ids):
        label = label_names.get(int(cls_id), "gun")
        out.append(
            (
                label,
                float(score),
                [float(box[0]), float(box[1]), float(box[2]), float(box[3])],
            )
        )
    out.sort(key=lambda item: item[1], reverse=True)
    return out
