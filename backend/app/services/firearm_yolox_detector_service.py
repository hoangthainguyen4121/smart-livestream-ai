"""Custom Firearm YOLOX-Nano ONNX (Apache-2.0) — local/thesis primary gun path.

Weights must live outside poc/ml trees via FIREARM_YOLOX_MODEL_PATH or
FIREARM_YOLOX_CACHE_DIR. Not production-deployed by default.
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

import numpy as np

from app.services.cv_evidence import save_gun_evidence
from app.services.firearm_yolox_postprocess import decode_yolox_onnx_output, letterbox_rgb_yolox

logger = logging.getLogger(__name__)

DEFAULT_IMGSZ = 416
DEFAULT_CONF = 0.02  # YOLOX score scale; corrected-GT best-F1 (≠ Subh775 0.65)
DEFAULT_IOU = 0.45
DEFAULT_ONNX_NAME = "gun_yolox_nano.onnx"


@dataclass(frozen=True)
class YoloxDetection:
    label: str
    score: float
    box: list[float]


@dataclass(frozen=True)
class YoloxDetectResult:
    detections: list[YoloxDetection]
    model_id: str
    model_revision: str
    inference_ms: float
    detector: str = "firearm_yolox"
    top_score: float = 0.0
    conf_threshold: float = DEFAULT_CONF


def is_firearm_yolox_enabled() -> bool:
    return os.getenv("FIREARM_YOLOX_ENABLED", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def resolve_cache_dir() -> Path | None:
    explicit = os.getenv("FIREARM_YOLOX_CACHE_DIR", "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path
    # default next to yolox data root
    path = Path.home() / ".cache" / "smart-livestream-firearm-yolox" / "artifacts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_onnx_path() -> Path | None:
    override = os.getenv("FIREARM_YOLOX_MODEL_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    cache = resolve_cache_dir()
    if cache is None:
        return None
    return cache / DEFAULT_ONNX_NAME


def _refuse_inside_projects(path: Path) -> None:
    project_roots = [Path(__file__).resolve().parents[3]]
    ml_sibling = project_roots[0].parent / "smart-livestream-ml"
    if ml_sibling.exists():
        project_roots.append(ml_sibling.resolve())
    for root in project_roots:
        try:
            path.resolve().relative_to(root.resolve())
            raise RuntimeError(
                "firearm_yolox_path_inside_project: point FIREARM_YOLOX_MODEL_PATH / "
                "FIREARM_YOLOX_CACHE_DIR outside smart-livestream-poc / smart-livestream-ml"
            )
        except ValueError:
            pass


def decode_image_base64_to_rgb(image_base64: str) -> np.ndarray:
    from PIL import Image

    payload = image_base64.split(",", 1)[-1]
    raw = base64.b64decode(payload)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.asarray(image, dtype=np.uint8)


class FirearmYoloxDetectorService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session = None
        self._input_name: str | None = None
        self._imgsz = DEFAULT_IMGSZ
        self._load_error: str | None = None
        self._onnx_path: Path | None = None
        self._deps_ok: bool | None = None

    def status(self) -> dict[str, Any]:
        cache = resolve_cache_dir()
        onnx_path = resolve_onnx_path()
        return {
            "enabled": is_firearm_yolox_enabled(),
            "ready": self._session is not None,
            "detector": "firearm_yolox",
            "model_id": "custom_gun_yolox_nano",
            "model_revision": "hardneg_finetune",
            "architecture": "YOLOX-Nano-ONNX",
            "license": "Apache-2.0 (Megvii YOLOX) + CC BY 4.0 Simuletic train data",
            "classes": ["gun"],
            "imgsz": self._imgsz,
            "cache_dir": str(cache) if cache else None,
            "onnx_path": str(onnx_path) if onnx_path else None,
            "onnx_exists": bool(onnx_path and onnx_path.is_file()),
            "loaded_onnx_path": str(self._onnx_path) if self._onnx_path else None,
            "auto_terminates_session": False,
            "stores_violation_images": False,
            "load_error": self._load_error,
            "dependencies_installed": self._dependencies_installed(),
            "conf_threshold": float(
                os.getenv("FIREARM_YOLOX_CONF", str(DEFAULT_CONF)) or DEFAULT_CONF
            ),
            "runtime": "onnxruntime",
            "ultralytics_runtime": False,
            "production_default": False,
        }

    def _dependencies_installed(self) -> bool:
        if self._deps_ok is not None:
            return self._deps_ok
        try:
            import onnxruntime  # noqa: F401
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
            self._load_error = "firearm_yolox_dependencies_missing"
            raise RuntimeError(self._load_error)

        onnx_path = resolve_onnx_path()
        if onnx_path is None or not onnx_path.is_file():
            self._load_error = (
                "firearm_yolox_missing: train/export gun_yolox_nano.onnx then set "
                f"FIREARM_YOLOX_MODEL_PATH (expected {onnx_path})"
            )
            raise RuntimeError(self._load_error)
        _refuse_inside_projects(onnx_path)

        import onnxruntime as ort

        try:
            session = ort.InferenceSession(
                str(onnx_path),
                providers=["CPUExecutionProvider"],
            )
            inp = session.get_inputs()[0]
            self._session = session
            self._input_name = inp.name
            if inp.shape and len(inp.shape) >= 4 and isinstance(inp.shape[2], int):
                self._imgsz = int(inp.shape[2])
            self._onnx_path = onnx_path
            self._load_error = None
            logger.info("Firearm YOLOX ONNX loaded path=%s", onnx_path)
        except Exception as exc:  # noqa: BLE001
            self._load_error = f"firearm_yolox_load_failed: {type(exc).__name__}: {exc}"
            raise RuntimeError(self._load_error) from exc

    def detect_image_rgb(
        self,
        rgb: np.ndarray,
        *,
        expected: str | None = None,
        video_id: str | None = None,
        timestamp_sec: float | None = None,
    ) -> YoloxDetectResult:
        self.ensure_loaded()
        assert self._session is not None and self._input_name is not None

        conf = float(os.getenv("FIREARM_YOLOX_CONF", str(DEFAULT_CONF)) or DEFAULT_CONF)
        iou = float(os.getenv("FIREARM_YOLOX_IOU", str(DEFAULT_IOU)) or DEFAULT_IOU)
        imgsz = int(os.getenv("FIREARM_YOLOX_IMGSZ", str(self._imgsz)) or self._imgsz)

        tensor, meta = letterbox_rgb_yolox(rgb, imgsz=imgsz)
        started = time.perf_counter()
        outputs = self._session.run(None, {self._input_name: tensor})
        inference_ms = (time.perf_counter() - started) * 1000.0
        decoded = decode_yolox_onnx_output(
            outputs[0], meta, conf_thres=0.01, iou_thres=iou
        )
        top_score = max((d["score"] for d in decoded), default=0.0)
        detections = [
            YoloxDetection(label=d["label"], score=d["score"], box=d["box"])
            for d in decoded
            if d["score"] >= conf
        ]
        pred = "gun" if detections else "miss"
        box = detections[0].box if detections else (decoded[0]["box"] if decoded else None)
        save_gun_evidence(
            rgb=rgb,
            detector="firearm_yolox",
            prediction=pred if detections else ("gun" if top_score >= conf else "miss"),
            score=float(top_score),
            box=box,
            timestamp_sec=timestamp_sec,
            expected=expected,
            video_id=video_id,
        )
        return YoloxDetectResult(
            detections=detections,
            model_id="custom_gun_yolox_nano",
            model_revision="hardneg_finetune",
            inference_ms=round(inference_ms, 2),
            top_score=round(float(top_score), 4),
            conf_threshold=round(float(conf), 4),
        )

    def detect_image_base64(self, image_base64: str) -> YoloxDetectResult:
        return self.detect_image_rgb(decode_image_base64_to_rgb(image_base64))

    def reset_for_tests(self) -> None:
        with self._lock:
            self._session = None
            self._input_name = None
            self._load_error = None
            self._onnx_path = None


firearm_yolox_detector_service = FirearmYoloxDetectorService()
