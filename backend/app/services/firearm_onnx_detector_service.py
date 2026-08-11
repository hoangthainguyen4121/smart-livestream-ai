"""Specialized firearm detector via ONNX Runtime (A/B spike).

Candidate: Subh775/Firearm_Detection_Yolov8n (YOLOv8n, 1×Gun, imgsz=640).
Inference path uses onnxruntime only — no ultralytics import at runtime.

License note (spike): HF model card YAML lists AGPL-3.0 (Ultralytics derivative);
README body historically claimed Apache-2.0. Treat as AGPL for product decisions.
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
from typing import Any, Optional

import numpy as np

from app.services.firearm_onnx_postprocess import decode_yolov8_output, letterbox_rgb

logger = logging.getLogger(__name__)

DEFAULT_HF_REPO = "Subh775/Firearm_Detection_Yolov8n"
DEFAULT_PT_FILENAME = "weights/best.pt"
DEFAULT_ONNX_FILENAME = "firearm_yolov8n.onnx"
DEFAULT_IMGSZ = 640
# Calibrated 2026-08-09 (.local/cv-eval): 0.65 P≈0.81 R≈0.65; 0.40 had FP on faces/Breathless.
DEFAULT_CONF = 0.65
DEFAULT_IOU = 0.45


@dataclass(frozen=True)
class FirearmDetection:
    label: str
    score: float
    box: list[float]


@dataclass(frozen=True)
class FirearmDetectResult:
    detections: list[FirearmDetection]
    model_id: str
    model_revision: str
    inference_ms: float
    detector: str = "firearm_onnx"
    top_score: float = 0.0
    conf_threshold: float = DEFAULT_CONF


def is_firearm_onnx_enabled() -> bool:
    return os.getenv("FIREARM_ONNX_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def resolve_hf_repo() -> str:
    return os.getenv("FIREARM_ONNX_HF_REPO", DEFAULT_HF_REPO).strip() or DEFAULT_HF_REPO


def resolve_cache_dir() -> Path | None:
    explicit = os.getenv("FIREARM_ONNX_CACHE_DIR", "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path
    return None


def resolve_onnx_path() -> Path | None:
    override = os.getenv("FIREARM_ONNX_MODEL_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    cache = resolve_cache_dir()
    if cache is None:
        return None
    return cache / DEFAULT_ONNX_FILENAME


def _refuse_cache_inside_projects(cache: Path) -> None:
    project_roots = [Path(__file__).resolve().parents[3]]
    ml_sibling = project_roots[0].parent / "smart-livestream-ml"
    if ml_sibling.exists():
        project_roots.append(ml_sibling.resolve())
    for root in project_roots:
        try:
            cache.relative_to(root)
            raise RuntimeError(
                "firearm_onnx_cache_inside_project: point FIREARM_ONNX_CACHE_DIR "
                "outside smart-livestream-poc / smart-livestream-ml"
            )
        except ValueError:
            pass


def decode_image_base64_to_rgb(image_base64: str) -> np.ndarray:
    from PIL import Image

    payload = image_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.asarray(image, dtype=np.uint8)


class FirearmOnnxDetectorService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session = None
        self._input_name: str | None = None
        self._load_error: str | None = None
        self._onnx_path: Path | None = None
        self._deps_ok: bool | None = None

    def status(self) -> dict[str, Any]:
        cache = resolve_cache_dir()
        onnx_path = resolve_onnx_path()
        return {
            "enabled": is_firearm_onnx_enabled(),
            "ready": self._session is not None,
            "detector": "firearm_onnx",
            "model_id": resolve_hf_repo(),
            "model_revision": "weights/best.pt→onnx",
            "architecture": "YOLOv8n-ONNX",
            "license": "agpl-3.0 (HF card; Ultralytics derivative — verify before production)",
            "classes": ["gun"],
            "imgsz": DEFAULT_IMGSZ,
            "pt_size_bytes_expected": 6_238_307,
            "cache_dir": str(cache) if cache else None,
            "cache_dir_configured": cache is not None,
            "onnx_path": str(onnx_path) if onnx_path else None,
            "onnx_exists": bool(onnx_path and onnx_path.is_file()),
            "loaded_onnx_path": str(self._onnx_path) if self._onnx_path else None,
            "auto_terminates_session": False,
            "stores_violation_images": False,
            "load_error": self._load_error,
            "dependencies_installed": self._dependencies_installed(),
            "runtime": "onnxruntime",
            "ultralytics_runtime": False,
        }

    def _dependencies_installed(self) -> bool:
        if self._deps_ok is not None:
            return self._deps_ok
        try:
            import onnxruntime  # noqa: F401
            import numpy  # noqa: F401
            from PIL import Image  # noqa: F401
        except ImportError:
            self._deps_ok = False
            return False
        self._deps_ok = True
        return True

    def ensure_loaded(self) -> None:
        if self._session is not None:
            return
        with self._lock:
            if self._session is not None:
                return
            self._load_locked()

    def _load_locked(self) -> None:
        if not self._dependencies_installed():
            self._load_error = (
                "firearm_onnx_dependencies_missing: "
                "pip install -r requirements-firearm-onnx.txt"
            )
            raise RuntimeError(self._load_error)

        cache = resolve_cache_dir()
        if cache is None:
            self._load_error = (
                "firearm_onnx_cache_dir_required: set FIREARM_ONNX_CACHE_DIR "
                "outside the project tree"
            )
            raise RuntimeError(self._load_error)
        _refuse_cache_inside_projects(cache)

        onnx_path = resolve_onnx_path()
        if onnx_path is None or not onnx_path.is_file():
            self._load_error = (
                "firearm_onnx_missing: run "
                "`python scripts/export_firearm_onnx.py` "
                f"(expected {onnx_path})"
            )
            raise RuntimeError(self._load_error)

        import onnxruntime as ort

        try:
            session = ort.InferenceSession(
                str(onnx_path),
                providers=["CPUExecutionProvider"],
            )
            self._session = session
            self._input_name = session.get_inputs()[0].name
            self._onnx_path = onnx_path
            self._load_error = None
            logger.info("Firearm ONNX loaded path=%s", onnx_path)
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"firearm_onnx_load_failed: {type(exc).__name__}: {exc}"
            raise RuntimeError(self._load_error) from exc

    def detect_image_rgb(self, rgb: np.ndarray) -> FirearmDetectResult:
        self.ensure_loaded()
        assert self._session is not None and self._input_name is not None

        conf = float(os.getenv("FIREARM_ONNX_CONF", str(DEFAULT_CONF)) or DEFAULT_CONF)
        iou = float(os.getenv("FIREARM_ONNX_IOU", str(DEFAULT_IOU)) or DEFAULT_IOU)
        imgsz = int(os.getenv("FIREARM_ONNX_IMGSZ", str(DEFAULT_IMGSZ)) or DEFAULT_IMGSZ)

        tensor, meta = letterbox_rgb(rgb, imgsz=imgsz)
        started = time.perf_counter()
        outputs = self._session.run(None, {self._input_name: tensor})
        inference_ms = (time.perf_counter() - started) * 1000.0
        # Decode low for raw top_score (harness), then apply calibrated conf for hits.
        decoded_raw = decode_yolov8_output(
            outputs[0],
            meta,
            conf_thres=0.01,
            iou_thres=iou,
        )
        top_score = max((score for _label, score, _box in decoded_raw), default=0.0)
        detections = [
            FirearmDetection(label=label, score=score, box=box)
            for label, score, box in decoded_raw
            if score >= conf
        ]
        if detections:
            from app.services.cv_evidence import save_gun_evidence

            save_gun_evidence(
                rgb=rgb,
                detector="firearm_onnx",
                prediction="gun",
                score=float(detections[0].score),
                box=detections[0].box,
            )
        return FirearmDetectResult(
            detections=detections,
            model_id=resolve_hf_repo(),
            model_revision="weights/best.pt→onnx",
            inference_ms=round(inference_ms, 2),
            top_score=round(float(top_score), 4),
            conf_threshold=round(float(conf), 4),
        )

    def detect_image_base64(self, image_base64: str) -> FirearmDetectResult:
        rgb = decode_image_base64_to_rgb(image_base64)
        return self.detect_image_rgb(rgb)

    def reset_for_tests(self) -> None:
        with self._lock:
            self._session = None
            self._input_name = None
            self._load_error = None
            self._onnx_path = None


firearm_onnx_detector_service = FirearmOnnxDetectorService()
