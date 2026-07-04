from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np


MIN_CAMERA_VISION_CONFIDENCE = 0.55


@dataclass(frozen=True)
class CameraProductMatch:
    product_id: str
    product_name: str
    score: float
    confidence: float
    source: str
    explanation: str


def is_camera_product_recognition_enabled() -> bool:
    return os.getenv("CAMERA_PRODUCT_RECOGNITION_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _decode_frame(frame_base64: str) -> np.ndarray:
    payload = frame_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    buffer = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode camera frame.")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def _compute_signature(image_rgb: np.ndarray, size: int = 64) -> tuple[str, np.ndarray]:
    resized = cv2.resize(image_rgb, (size, size), interpolation=cv2.INTER_AREA)
    grayscale = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)

    bits: list[str] = []
    for row in range(8):
        for column in range(8):
            left = int(grayscale[row, column])
            right = int(grayscale[row, column + 1])
            bits.append("1" if left > right else "0")

    histogram = np.zeros(24, dtype=np.float32)
    for channel in range(3):
        channel_values = resized[:, :, channel].reshape(-1)
        bins = (channel_values // 32).astype(np.int32)
        for value in bins:
            histogram[channel * 8 + int(value)] += 1

    total = float(histogram.sum()) or 1.0
    return "".join(bits), histogram / total


def _compare_signatures(
    left_hash: str,
    left_hist: np.ndarray,
    right_hash: str,
    right_hist: np.ndarray,
) -> float:
    hash_matches = sum(1 for index, bit in enumerate(left_hash) if right_hash[index] == bit)
    hash_score = hash_matches / len(left_hash)
    dot = float(np.dot(left_hist, right_hist))
    left_norm = float(np.linalg.norm(left_hist))
    right_norm = float(np.linalg.norm(right_hist))
    color_score = dot / (left_norm * right_norm) if left_norm and right_norm else 0.0
    return min(1.0, hash_score * 0.6 + color_score * 0.4)


def _load_catalog_image(image_url: str, root: str) -> np.ndarray | None:
    if not image_url.startswith("/"):
        return None
    path = os.path.join(root, "frontend", "public", image_url.lstrip("/"))
    if not os.path.exists(path):
        return None
    svg_bytes = open(path, "rb").read()
    buffer = np.frombuffer(svg_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        return None
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def match_frame_against_catalog(
    frame_base64: str,
    catalog: list[dict[str, Any]],
    minimum_confidence: float = MIN_CAMERA_VISION_CONFIDENCE,
) -> CameraProductMatch | None:
    frame_image = _decode_frame(frame_base64)
    frame_hash, frame_hist = _compute_signature(frame_image)
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

    best: tuple[dict[str, Any], float] | None = None
    second_score = 0.0
    for product in catalog:
        image_url = product.get("imageUrl") or product.get("image_url") or ""
        image = _load_catalog_image(image_url, repo_root)
        if image is None:
            continue
        product_hash, product_hist = _compute_signature(image)
        score = _compare_signatures(frame_hash, frame_hist, product_hash, product_hist)
        if best is None or score > best[1]:
            second_score = best[1] if best else 0.0
            best = (product, score)
        elif score > second_score:
            second_score = score

    if best is None or best[1] < minimum_confidence:
        return None

    product, score = best
    confidence = min(0.98, score + max(0.0, score - second_score) * 0.1)
    return CameraProductMatch(
        product_id=product["id"],
        product_name=product.get("name", product["id"]),
        score=round(float(score), 3),
        confidence=round(float(confidence), 2),
        source="camera_vision",
        explanation=f'Catalog image match against {product.get("name", product["id"])}.',
    )
