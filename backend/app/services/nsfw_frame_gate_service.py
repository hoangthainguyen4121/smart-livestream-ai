"""Local Adult/NSFW frame-gate using Falconsai/nsfw_image_detection.

Weights load from an external Hugging Face cache (never committed).
Frames are classified on this process only — no third-party inference API.
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

DEFAULT_MODEL_ID = "Falconsai/nsfw_image_detection"
# Pinned revision verified from Hugging Face API (2026-08-04).
DEFAULT_MODEL_REVISION = "04367978d3474804ab1a00a9bd6548b741764069"
DEFAULT_MIN_NSFW_SCORE = 0.70

# Approximate safetensors footprint (~85.8M float32 params).
EXPECTED_PARAM_COUNT = 85_800_194


@dataclass(frozen=True)
class NsfwClassificationResult:
    label: str
    nsfw_score: float
    normal_score: float
    is_nsfw: bool
    model_id: str
    model_revision: str
    inference_ms: float


def is_nsfw_frame_gate_enabled() -> bool:
    return os.getenv("NSFW_FRAME_GATE_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def resolve_model_id() -> str:
    return os.getenv("NSFW_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID


def resolve_model_revision() -> str:
    return (
        os.getenv("NSFW_MODEL_REVISION", DEFAULT_MODEL_REVISION).strip()
        or DEFAULT_MODEL_REVISION
    )


def resolve_cache_dir() -> Path | None:
    """Prefer NSFW_MODEL_CACHE_DIR, then HF_HOME/TRANSFORMERS_CACHE if set."""
    explicit = os.getenv("NSFW_MODEL_CACHE_DIR", "").strip()
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
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return image


class NsfwFrameGateService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._processor = None
        self._load_error: str | None = None
        self._loaded_revision: str | None = None
        self._loaded_model_id: str | None = None
        self._cache_dir: str | None = None
        self._deps_ok: bool | None = None

    def status(self) -> dict[str, Any]:
        cache = resolve_cache_dir()
        return {
            "enabled": is_nsfw_frame_gate_enabled(),
            "ready": self._model is not None and self._processor is not None,
            "model_id": resolve_model_id(),
            "model_revision": resolve_model_revision(),
            "loaded_model_id": self._loaded_model_id,
            "loaded_revision": self._loaded_revision,
            "cache_dir": str(cache) if cache else None,
            "cache_dir_configured": cache is not None,
            "architecture": "ViTForImageClassification",
            "labels": ["normal", "nsfw"],
            "license": "apache-2.0",
            "trust_remote_code": False,
            "stores_violation_images": False,
            "auto_terminates_session": False,
            "load_error": self._load_error,
            "dependencies_installed": self._dependencies_installed(),
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

    def _load_locked(self) -> None:
        if not self._dependencies_installed():
            self._load_error = (
                "nsfw_dependencies_missing: pip install -r requirements-nsfw.txt"
            )
            raise RuntimeError(self._load_error)

        cache_dir = resolve_cache_dir()
        if cache_dir is None:
            self._load_error = (
                "nsfw_cache_dir_required: set NSFW_MODEL_CACHE_DIR "
                "(or HF_HOME / TRANSFORMERS_CACHE) outside the project"
            )
            raise RuntimeError(self._load_error)

        # Refuse caches that sit inside this POC tree (weights must stay out of repo).
        poc_root = Path(__file__).resolve().parents[3]  # .../smart-livestream-poc
        try:
            cache_dir.resolve().relative_to(poc_root)
        except ValueError:
            pass
        else:
            self._load_error = (
                "nsfw_cache_inside_project: point NSFW_MODEL_CACHE_DIR "
                "outside smart-livestream-poc (e.g. %USERPROFILE%\\.cache\\smart-livestream-nsfw)"
            )
            raise RuntimeError(self._load_error)

        model_id = resolve_model_id()
        revision = resolve_model_revision()

        from transformers import AutoModelForImageClassification, ViTImageProcessor

        logger.info(
            "Loading NSFW model id=%s revision=%s cache=%s",
            model_id,
            revision,
            cache_dir,
        )
        try:
            processor = ViTImageProcessor.from_pretrained(
                model_id,
                revision=revision,
                cache_dir=str(cache_dir),
                local_files_only=os.getenv("NSFW_LOCAL_FILES_ONLY", "").strip().lower()
                in {"1", "true", "yes", "on"},
            )
            model = AutoModelForImageClassification.from_pretrained(
                model_id,
                revision=revision,
                cache_dir=str(cache_dir),
                trust_remote_code=False,
                local_files_only=os.getenv("NSFW_LOCAL_FILES_ONLY", "").strip().lower()
                in {"1", "true", "yes", "on"},
            )
            model.eval()
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"nsfw_model_load_failed: {type(exc).__name__}: {exc}"
            logger.exception("NSFW model load failed")
            raise RuntimeError(self._load_error) from exc

        id2label = {int(k): v for k, v in model.config.id2label.items()}
        if set(id2label.values()) != {"normal", "nsfw"}:
            self._load_error = f"nsfw_unexpected_labels: {id2label}"
            raise RuntimeError(self._load_error)

        self._processor = processor
        self._model = model
        self._loaded_model_id = model_id
        self._loaded_revision = revision
        self._cache_dir = str(cache_dir)
        self._load_error = None
        logger.info("NSFW model ready revision=%s", revision)

    def classify_image_base64(self, image_base64: str) -> NsfwClassificationResult:
        import torch

        self.ensure_loaded()
        assert self._model is not None and self._processor is not None

        image = decode_image_base64_to_pil(image_base64)
        started = time.perf_counter()
        inputs = self._processor(images=image, return_tensors="pt")
        with torch.no_grad():
            logits = self._model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)[0]

        id2label = {int(k): str(v) for k, v in self._model.config.id2label.items()}
        scores = {id2label[i]: float(probs[i].item()) for i in range(probs.shape[0])}
        normal_score = scores.get("normal", 0.0)
        nsfw_score = scores.get("nsfw", 0.0)
        label = "nsfw" if nsfw_score >= normal_score else "normal"
        threshold = float(
            os.getenv("NSFW_MIN_SCORE", str(DEFAULT_MIN_NSFW_SCORE)) or DEFAULT_MIN_NSFW_SCORE
        )
        is_nsfw = label == "nsfw" and nsfw_score >= threshold
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        return NsfwClassificationResult(
            label=label,
            nsfw_score=nsfw_score,
            normal_score=normal_score,
            is_nsfw=is_nsfw,
            model_id=self._loaded_model_id or resolve_model_id(),
            model_revision=self._loaded_revision or resolve_model_revision(),
            inference_ms=round(elapsed_ms, 2),
        )

    def reset_for_tests(self) -> None:
        with self._lock:
            self._model = None
            self._processor = None
            self._load_error = None
            self._loaded_revision = None
            self._loaded_model_id = None
            self._cache_dir = None
            self._deps_ok = None


nsfw_frame_gate_service = NsfwFrameGateService()
