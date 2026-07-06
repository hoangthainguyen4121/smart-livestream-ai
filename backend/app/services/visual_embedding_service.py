from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from typing import Any, Literal, Optional

import cv2
import numpy as np
from PIL import Image

EmbedderKind = Literal["clip", "fingerprint"]

MIN_VISUAL_MATCH_SCORE = 0.55


@dataclass(frozen=True)
class CatalogEmbeddingEntry:
    product_id: str
    product_name: str
    embedding: np.ndarray


@dataclass(frozen=True)
class VisualProductMatch:
    product_id: str
    product_name: str
    score: float
    confidence: float
    source: str
    embedder: EmbedderKind
    explanation: str


def is_hand_held_vision_enabled() -> bool:
    return os.getenv("HAND_HELD_VISION_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def decode_image_base64(image_base64: str) -> np.ndarray:
    payload = image_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    buffer = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        image = np.array(Image.open(io.BytesIO(raw)).convert("RGB"))
    else:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return image


def _fingerprint_embedding(image_rgb: np.ndarray, size: int = 64) -> np.ndarray:
    resized = cv2.resize(image_rgb, (size, size), interpolation=cv2.INTER_AREA)
    grayscale = cv2.cvtColor(resized, cv2.COLOR_RGB2GRAY)

    bits: list[float] = []
    for row in range(8):
        for column in range(8):
            left = float(grayscale[row, column])
            right = float(grayscale[row, column + 1])
            bits.append(1.0 if left > right else 0.0)

    histogram = np.zeros(24, dtype=np.float32)
    for channel in range(3):
        channel_values = resized[:, :, channel].reshape(-1)
        bins = (channel_values // 32).astype(np.int32)
        for value in bins:
            histogram[channel * 8 + int(value)] += 1

    histogram = histogram / (float(histogram.sum()) or 1.0)
    vector = np.concatenate([np.asarray(bits, dtype=np.float32), histogram])
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else vector


class VisualEmbeddingService:
    def __init__(self) -> None:
        self._catalog: list[CatalogEmbeddingEntry] = []
        self._clip_model: Optional[Any] = None
        self._clip_preprocess: Optional[Any] = None
        self._embedder: EmbedderKind = "fingerprint"
        self._clip_init_attempted = False

    @property
    def embedder(self) -> EmbedderKind:
        self._ensure_clip()
        return self._embedder

    @property
    def catalog_size(self) -> int:
        return len(self._catalog)

    def _ensure_clip(self) -> None:
        if self._clip_init_attempted:
            return
        self._clip_init_attempted = True

        if os.getenv("VISUAL_EMBEDDING_FORCE_FINGERPRINT", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }:
            return

        try:
            import open_clip
            import torch

            model, _, preprocess = open_clip.create_model_and_transforms(
                "ViT-B-32",
                pretrained="openai",
            )
            model.eval()
            self._clip_model = model
            self._clip_preprocess = preprocess
            self._torch = torch
            self._embedder = "clip"
        except Exception:
            self._clip_model = None
            self._clip_preprocess = None
            self._embedder = "fingerprint"

    def embed_image_rgb(self, image_rgb: np.ndarray) -> np.ndarray:
        self._ensure_clip()
        if self._clip_model is None or self._clip_preprocess is None:
            return _fingerprint_embedding(image_rgb)

        pil_image = Image.fromarray(image_rgb)
        tensor = self._clip_preprocess(pil_image).unsqueeze(0)
        with self._torch.no_grad():
            features = self._clip_model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)
        return features.squeeze(0).cpu().numpy().astype(np.float32)

    def sync_catalog(self, items: list[dict[str, str]]) -> dict[str, Any]:
        entries: list[CatalogEmbeddingEntry] = []
        skipped: list[str] = []

        for item in items:
            product_id = str(item.get("id") or "").strip()
            product_name = str(item.get("name") or product_id).strip()
            image_base64 = str(item.get("imageBase64") or "").strip()
            if not product_id or not image_base64:
                skipped.append(product_id or "unknown")
                continue

            try:
                image_rgb = decode_image_base64(image_base64)
                embedding = self.embed_image_rgb(image_rgb)
                entries.append(
                    CatalogEmbeddingEntry(
                        product_id=product_id,
                        product_name=product_name,
                        embedding=embedding,
                    )
                )
            except Exception:
                skipped.append(product_id)

        self._catalog = entries
        return {
            "indexed": len(entries),
            "skipped": skipped,
            "embedder": self.embedder,
        }

    def match_crop(
        self,
        crop_image_base64: str,
        minimum_score: float = MIN_VISUAL_MATCH_SCORE,
    ) -> Optional[VisualProductMatch]:
        if not self._catalog:
            return None

        crop_rgb = decode_image_base64(crop_image_base64)
        query = self.embed_image_rgb(crop_rgb)

        best: CatalogEmbeddingEntry | None = None
        best_score = -1.0
        second_score = -1.0

        for entry in self._catalog:
            score = float(np.dot(query, entry.embedding))
            if score > best_score:
                second_score = best_score
                best_score = score
                best = entry
            elif score > second_score:
                second_score = score

        if best is None or best_score < minimum_score:
            return None

        confidence = min(0.98, best_score + max(0.0, best_score - second_score) * 0.1)
        return VisualProductMatch(
            product_id=best.product_id,
            product_name=best.product_name,
            score=round(best_score, 3),
            confidence=round(confidence, 2),
            source="hand_held_vision",
            embedder=self.embedder,
            explanation=(
                f"Visual embedding match ({self.embedder}) against catalog image "
                f"for {best.product_name}."
            ),
        )


visual_embedding_service = VisualEmbeddingService()
