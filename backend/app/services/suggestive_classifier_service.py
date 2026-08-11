"""Local suggestive multi-class classifier (viddexa/nsfw-detection-2-nano).

Apache-2.0 EfficientNet-B0. Cache outside project. Complements Falconsai explicit lane.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "viddexa/nsfw-detection-2-nano"
# Snapshot verified 2026-08-09 via HF API.
DEFAULT_MODEL_REVISION = "12e57200346246b37382f746e4d94d10b014f6a1"


@dataclass(frozen=True)
class SuggestiveClassificationResult:
    label: str
    score: float
    scores: dict[str, float]
    model_id: str
    model_revision: str
    inference_ms: float


def is_suggestive_classifier_enabled() -> bool:
    return os.getenv("SUGGESTIVE_CLASSIFIER_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def resolve_model_id() -> str:
    return os.getenv("SUGGESTIVE_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID


def resolve_model_revision() -> str:
    return (
        os.getenv("SUGGESTIVE_MODEL_REVISION", DEFAULT_MODEL_REVISION).strip()
        or DEFAULT_MODEL_REVISION
    )


def resolve_cache_dir() -> Path | None:
    explicit = os.getenv("SUGGESTIVE_MODEL_CACHE_DIR", "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path
    for key in ("TRANSFORMERS_CACHE", "HF_HOME"):
        value = os.getenv(key, "").strip()
        if value:
            path = Path(value).expanduser().resolve()
            path.mkdir(parents=True, exist_ok=True)
            return path
    return None


def decode_image_base64_to_pil(image_base64: str):
    from PIL import Image

    payload = image_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    return Image.open(io.BytesIO(raw)).convert("RGB")


class SuggestiveClassifierService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._processor = None
        self._load_error: str | None = None
        self._loaded_revision: str | None = None
        self._loaded_model_id: str | None = None
        self._deps_ok: bool | None = None
        self._device = "cpu"

    def status(self) -> dict[str, Any]:
        cache = resolve_cache_dir()
        return {
            "enabled": is_suggestive_classifier_enabled(),
            "ready": self._model is not None and self._processor is not None,
            "model_id": resolve_model_id(),
            "model_revision": resolve_model_revision(),
            "loaded_model_id": self._loaded_model_id,
            "loaded_revision": self._loaded_revision,
            "architecture": "EfficientNetForImageClassification",
            "license": "apache-2.0",
            "labels": ["safe", "hentai", "porn", "sexy", "drawing"],
            "taxonomy": ["SAFE", "SUGGESTIVE", "EXPLICIT"],
            "cache_dir": str(cache) if cache else None,
            "cache_dir_configured": cache is not None,
            "auto_terminates_session": False,
            "stores_violation_images": False,
            "load_error": self._load_error,
            "dependencies_installed": self._dependencies_installed(),
            "device": self._device,
        }

    def _dependencies_installed(self) -> bool:
        if self._deps_ok is not None:
            return self._deps_ok
        try:
            import transformers  # noqa: F401
            import torch  # noqa: F401
        except ImportError:
            self._deps_ok = False
            return False
        self._deps_ok = True
        return True

    def ensure_loaded(self) -> None:
        if self._model is not None and self._processor is not None:
            return
        with self._lock:
            if self._model is not None and self._processor is not None:
                return
            self._load_locked()

    def _refuse_cache_inside_projects(self, cache: Path) -> None:
        project_roots = [Path(__file__).resolve().parents[3]]
        ml_sibling = project_roots[0].parent / "smart-livestream-ml"
        if ml_sibling.exists():
            project_roots.append(ml_sibling.resolve())
        for root in project_roots:
            try:
                cache.relative_to(root)
                raise RuntimeError(
                    "suggestive_cache_inside_project: point SUGGESTIVE_MODEL_CACHE_DIR "
                    "outside smart-livestream-poc / smart-livestream-ml"
                )
            except ValueError:
                pass

    def _load_locked(self) -> None:
        if not self._dependencies_installed():
            self._load_error = (
                "suggestive_dependencies_missing: pip install -r requirements-nsfw.txt"
            )
            raise RuntimeError(self._load_error)

        cache = resolve_cache_dir()
        if cache is None:
            self._load_error = (
                "suggestive_cache_dir_required: set SUGGESTIVE_MODEL_CACHE_DIR "
                "outside the project tree"
            )
            raise RuntimeError(self._load_error)
        self._refuse_cache_inside_projects(cache)

        import torch
        from transformers import AutoImageProcessor, AutoModelForImageClassification

        model_id = resolve_model_id()
        revision = resolve_model_revision()
        local_only = os.getenv("SUGGESTIVE_LOCAL_FILES_ONLY", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        try:
            processor = AutoImageProcessor.from_pretrained(
                model_id,
                revision=revision,
                cache_dir=str(cache),
                local_files_only=local_only,
            )
            model = AutoModelForImageClassification.from_pretrained(
                model_id,
                revision=revision,
                cache_dir=str(cache),
                local_files_only=local_only,
            )
            model.eval()
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            model.to(self._device)
            self._processor = processor
            self._model = model
            self._loaded_model_id = model_id
            self._loaded_revision = revision
            self._load_error = None
            logger.info(
                "Suggestive classifier loaded model_id=%s revision=%s device=%s",
                model_id,
                revision,
                self._device,
            )
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"suggestive_model_load_failed: {type(exc).__name__}: {exc}"
            raise RuntimeError(self._load_error) from exc

    def classify_image(self, image) -> SuggestiveClassificationResult:
        self.ensure_loaded()
        assert self._model is not None and self._processor is not None

        import torch

        started = time.perf_counter()
        inputs = self._processor(images=image, return_tensors="pt")
        inputs = {key: value.to(self._device) for key, value in inputs.items()}
        with torch.no_grad():
            logits = self._model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)[0]

        id2label = {int(k): str(v) for k, v in self._model.config.id2label.items()}
        scores = {id2label[i].lower(): float(probs[i].item()) for i in range(probs.shape[0])}
        # Prefer highest probability label.
        label = max(scores.items(), key=lambda item: item[1])[0]
        score = scores[label]
        inference_ms = (time.perf_counter() - started) * 1000.0

        return SuggestiveClassificationResult(
            label=label,
            score=score,
            scores=scores,
            model_id=self._loaded_model_id or resolve_model_id(),
            model_revision=self._loaded_revision or resolve_model_revision(),
            inference_ms=round(inference_ms, 2),
        )

    def classify_image_base64(self, image_base64: str) -> SuggestiveClassificationResult:
        return self.classify_image(decode_image_base64_to_pil(image_base64))

    def reset_for_tests(self) -> None:
        with self._lock:
            self._model = None
            self._processor = None
            self._load_error = None
            self._loaded_revision = None
            self._loaded_model_id = None


suggestive_classifier_service = SuggestiveClassifierService()
