"""Local open-vocabulary weapon detector (Grounding DINO tiny).

Apache-2.0 pretrained weights from IDEA-Research via Hugging Face Transformers.
Frames stay on this process — no third-party inference API.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "IDEA-Research/grounding-dino-tiny"
# Pinned from HF API (sha) verified 2026-08-09.
DEFAULT_MODEL_REVISION = "a2bb814dd30d776dcf7e30523b00659f4f141c71"
# Smoke showed banana FP ~0.41 at 0.30; raise default for warning-only MVP.
DEFAULT_BOX_THRESHOLD = 0.42
DEFAULT_TEXT_THRESHOLD = 0.30
DEFAULT_MAX_EDGE = 640

# Grounding DINO expects lowercase phrases ending with periods.
# Extra gun-family phrases improve recall on handheld / rack firearms (tiny DINO).
DEFAULT_TEXT_PROMPT = (
    "gun. pistol. rifle. firearm. handgun. shotgun. "
    "assault rifle. submachine gun. knife. scissors."
)

NORMALIZED_LABELS = frozenset(
    {"gun", "pistol", "rifle", "firearm", "knife", "scissors"}
)


@dataclass(frozen=True)
class WeaponDetection:
    label: str
    score: float
    box: list[float]  # xyxy absolute pixels


@dataclass(frozen=True)
class WeaponDetectResult:
    detections: list[WeaponDetection]
    model_id: str
    model_revision: str
    inference_ms: float
    prompt: str


def is_weapon_detector_enabled() -> bool:
    return os.getenv("WEAPON_DETECTOR_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def resolve_model_id() -> str:
    return os.getenv("WEAPON_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID


def resolve_model_revision() -> str:
    return (
        os.getenv("WEAPON_MODEL_REVISION", DEFAULT_MODEL_REVISION).strip()
        or DEFAULT_MODEL_REVISION
    )


def resolve_cache_dir() -> Path | None:
    explicit = os.getenv("WEAPON_MODEL_CACHE_DIR", "").strip()
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


def resolve_text_prompt() -> str:
    raw = os.getenv("WEAPON_TEXT_PROMPT", DEFAULT_TEXT_PROMPT).strip().lower()
    return raw or DEFAULT_TEXT_PROMPT


def decode_image_base64_to_pil(image_base64: str):
    from PIL import Image

    payload = image_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def normalize_weapon_label(raw_label: str) -> Optional[str]:
    text = re.sub(r"[^a-z0-9\s\-]", " ", (raw_label or "").strip().lower())
    tokens = [part for part in text.split() if part]
    if not tokens:
        return None
    joined = " ".join(tokens)
    for label in NORMALIZED_LABELS:
        if label in joined.split() or joined == label:
            return label
    # Phrase containment (e.g. "a pistol").
    for label in ("pistol", "rifle", "firearm", "scissors", "knife", "gun"):
        if label in joined:
            return label
    return None


def _resize_for_inference(image, max_edge: int):
    width, height = image.size
    longest = max(width, height)
    if longest <= max_edge:
        return image
    scale = max_edge / float(longest)
    new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(new_size)


class WeaponDetectorService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._processor = None
        self._device = "cpu"
        self._load_error: str | None = None
        self._loaded_revision: str | None = None
        self._loaded_model_id: str | None = None
        self._deps_ok: bool | None = None

    def status(self) -> dict[str, Any]:
        cache = resolve_cache_dir()
        return {
            "enabled": is_weapon_detector_enabled(),
            "ready": self._model is not None and self._processor is not None,
            "model_id": resolve_model_id(),
            "model_revision": resolve_model_revision(),
            "loaded_model_id": self._loaded_model_id,
            "loaded_revision": self._loaded_revision,
            "cache_dir": str(cache) if cache else None,
            "cache_dir_configured": cache is not None,
            "architecture": "GroundingDinoForObjectDetection",
            "license": "apache-2.0",
            "prompt": resolve_text_prompt(),
            "normalized_labels": sorted(NORMALIZED_LABELS),
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

    def _load_locked(self) -> None:
        if not self._dependencies_installed():
            self._load_error = (
                "weapon_dependencies_missing: pip install -r requirements-weapon.txt"
            )
            raise RuntimeError(self._load_error)

        cache = resolve_cache_dir()
        if cache is None:
            self._load_error = (
                "weapon_cache_dir_required: set WEAPON_MODEL_CACHE_DIR "
                "outside the project tree"
            )
            raise RuntimeError(self._load_error)

        # Refuse caches inside either sibling repo.
        project_roots = [
            Path(__file__).resolve().parents[3],  # smart-livestream-poc
        ]
        ml_sibling = project_roots[0].parent / "smart-livestream-ml"
        if ml_sibling.exists():
            project_roots.append(ml_sibling.resolve())
        for root in project_roots:
            try:
                cache.relative_to(root)
                self._load_error = (
                    "weapon_cache_inside_project: point WEAPON_MODEL_CACHE_DIR "
                    "outside smart-livestream-poc / smart-livestream-ml"
                )
                raise RuntimeError(self._load_error)
            except ValueError:
                pass

        import torch
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

        model_id = resolve_model_id()
        revision = resolve_model_revision()
        local_only = os.getenv("WEAPON_LOCAL_FILES_ONLY", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        try:
            processor = AutoProcessor.from_pretrained(
                model_id,
                revision=revision,
                cache_dir=str(cache),
                local_files_only=local_only,
            )
            model = AutoModelForZeroShotObjectDetection.from_pretrained(
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
                "Weapon detector loaded model_id=%s revision=%s device=%s cache=%s",
                model_id,
                revision,
                self._device,
                cache,
            )
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"weapon_model_load_failed: {type(exc).__name__}: {exc}"
            raise RuntimeError(self._load_error) from exc

    def detect_image(self, image) -> WeaponDetectResult:
        self.ensure_loaded()
        assert self._model is not None and self._processor is not None

        import torch

        max_edge = int(os.getenv("WEAPON_MAX_EDGE", str(DEFAULT_MAX_EDGE)) or DEFAULT_MAX_EDGE)
        box_threshold = float(
            os.getenv("WEAPON_BOX_THRESHOLD", str(DEFAULT_BOX_THRESHOLD))
            or DEFAULT_BOX_THRESHOLD
        )
        text_threshold = float(
            os.getenv("WEAPON_TEXT_THRESHOLD", str(DEFAULT_TEXT_THRESHOLD))
            or DEFAULT_TEXT_THRESHOLD
        )
        prompt = resolve_text_prompt()
        working = _resize_for_inference(image, max_edge)
        scale_x = image.size[0] / working.size[0]
        scale_y = image.size[1] / working.size[1]

        started = time.perf_counter()
        inputs = self._processor(images=working, text=prompt, return_tensors="pt")
        inputs = {key: value.to(self._device) for key, value in inputs.items()}
        with torch.no_grad():
            outputs = self._model(**inputs)

        # transformers>=4.40 / 4.51+: prefer text_labels for string phrases.
        try:
            processed = self._processor.post_process_grounded_object_detection(
                outputs,
                input_ids=inputs["input_ids"],
                threshold=box_threshold,
                text_threshold=text_threshold,
                target_sizes=[working.size[::-1]],
            )
        except TypeError:
            try:
                processed = self._processor.post_process_grounded_object_detection(
                    outputs,
                    inputs["input_ids"],
                    box_threshold=box_threshold,
                    text_threshold=text_threshold,
                    target_sizes=[working.size[::-1]],
                )
            except TypeError:
                processed = self._processor.post_process_grounded_object_detection(
                    outputs,
                    threshold=box_threshold,
                    text_threshold=text_threshold,
                    target_sizes=[working.size[::-1]],
                    text_labels=[[prompt]],
                )

        inference_ms = (time.perf_counter() - started) * 1000.0
        first = processed[0] if processed else {}
        boxes = first.get("boxes", [])
        scores = first.get("scores", [])
        # Prefer text_labels; do not use `or` — empty list is falsy and would fall back to int ids.
        labels = first.get("text_labels")
        if labels is None:
            labels = first.get("labels") or []

        detections: list[WeaponDetection] = []
        for box, score, label in zip(boxes, scores, labels):
            if hasattr(box, "tolist"):
                xyxy = [float(v) for v in box.tolist()]
            else:
                xyxy = [float(v) for v in box]
            # Map back to original image coordinates.
            xyxy = [
                xyxy[0] * scale_x,
                xyxy[1] * scale_y,
                xyxy[2] * scale_x,
                xyxy[3] * scale_y,
            ]
            score_f = float(score.item() if hasattr(score, "item") else score)
            if isinstance(label, (list, tuple)):
                label_text = str(label[0]) if label else ""
            else:
                label_text = str(label)
            # Integer token ids are not usable phrase labels.
            if label_text.isdigit():
                continue
            normalized = normalize_weapon_label(label_text)
            if normalized is None:
                continue
            detections.append(
                WeaponDetection(label=normalized, score=score_f, box=xyxy)
            )

        detections.sort(key=lambda item: item.score, reverse=True)
        return WeaponDetectResult(
            detections=detections,
            model_id=self._loaded_model_id or resolve_model_id(),
            model_revision=self._loaded_revision or resolve_model_revision(),
            inference_ms=inference_ms,
            prompt=prompt,
        )

    def detect_image_base64(self, image_base64: str) -> WeaponDetectResult:
        image = decode_image_base64_to_pil(image_base64)
        return self.detect_image(image)

    def reset_for_tests(self) -> None:
        with self._lock:
            self._model = None
            self._processor = None
            self._load_error = None
            self._loaded_revision = None
            self._loaded_model_id = None
            self._deps_ok = None
            self._device = "cpu"


weapon_detector_service = WeaponDetectorService()
