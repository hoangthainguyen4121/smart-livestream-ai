#!/usr/bin/env python3
"""LOCAL MINI-EVAL: Grounding DINO vs Firearm ONNX (not a scientific benchmark).

Uses HF model-card sample positives + synthetic/hard-negative stills.
Does NOT download or commit YouTube videos.

Env:
  FIREARM_ONNX_ENABLED=true
  FIREARM_ONNX_CACHE_DIR=...
  WEAPON_DETECTOR_ENABLED=true   # optional; DINO rows become errors if unset
  WEAPON_MODEL_CACHE_DIR=...
  FIREARM_AB_OUT_DIR=...         # default: %TEMP%/firearm-ab-minieval
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))


@dataclass
class FrameSpec:
    frame_id: str
    expected: str  # gun_present | no_gun
    notes: str
    path: Path


def _out_dir() -> Path:
    raw = os.getenv("FIREARM_AB_OUT_DIR", "").strip()
    if raw:
        path = Path(raw).expanduser().resolve()
    else:
        path = Path(os.environ.get("TEMP", "/tmp")) / "firearm-ab-minieval"
    path.mkdir(parents=True, exist_ok=True)
    (path / "frames").mkdir(exist_ok=True)
    return path


def _download_hf_positives(frames_dir: Path) -> list[FrameSpec]:
    from huggingface_hub import hf_hub_download

    repo = "Subh775/Firearm_Detection_Yolov8n"
    cache = os.getenv(
        "FIREARM_ONNX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-onnx"),
    )
    names = [
        ("pos_handheld_sample", "gd_000048_WhatsApp-Video-2022-07-11-at-1-1050_jpg.rf.654dffa8e581f14a1ecf7fcf83649afe.jpg"),
        ("pos_val0_labels", "val_batch0_labels.jpg"),
        ("pos_val1_labels", "val_batch1_labels.jpg"),
        ("pos_val2_labels", "val_batch2_labels.jpg"),
        ("pos_train_batch0", "train_batch0.jpg"),
        ("pos_train_batch31770", "train_batch31770.jpg"),
    ]
    specs: list[FrameSpec] = []
    for frame_id, filename in names:
        local = hf_hub_download(
            repo_id=repo,
            filename=filename,
            cache_dir=str(Path(cache) / "hf"),
        )
        dest = frames_dir / f"{frame_id}.jpg"
        data = Path(local).read_bytes()
        dest.write_bytes(data)
        specs.append(
            FrameSpec(
                frame_id=frame_id,
                expected="gun_present",
                notes="HF Subh775 card/sample image (research still; not YouTube)",
                path=dest,
            )
        )
    return specs


def _make_negatives(frames_dir: Path) -> list[FrameSpec]:
    specs: list[FrameSpec] = []

    def save(frame_id: str, image: Image.Image, notes: str) -> None:
        path = frames_dir / f"{frame_id}.jpg"
        image.convert("RGB").save(path, quality=90)
        specs.append(
            FrameSpec(
                frame_id=frame_id,
                expected="no_gun",
                notes=notes,
                path=path,
            )
        )

    # Banana-like yellow crescent (historic DINO FP class)
    banana = Image.new("RGB", (640, 480), (40, 80, 40))
    draw = ImageDraw.Draw(banana)
    draw.ellipse((180, 160, 460, 340), fill=(240, 210, 40))
    draw.ellipse((210, 150, 420, 300), fill=(40, 80, 40))
    save("neg_banana", banana, "synthetic banana-like hard negative")

    # Cordless-drill-like black body + chuck
    drill = Image.new("RGB", (640, 480), (220, 220, 220))
    d = ImageDraw.Draw(drill)
    d.rectangle((250, 140, 360, 340), fill=(30, 30, 30))
    d.rectangle((360, 200, 480, 250), fill=(60, 60, 60))
    d.ellipse((220, 160, 280, 220), fill=(20, 20, 20))
    save("neg_drill", drill, "synthetic cordless-drill silhouette")

    # Phone
    phone = Image.new("RGB", (640, 480), (245, 245, 245))
    p = ImageDraw.Draw(phone)
    p.rounded_rectangle((270, 80, 370, 400), radius=24, fill=(20, 20, 25))
    p.rectangle((285, 110, 355, 340), fill=(80, 120, 180))
    save("neg_phone", phone, "synthetic smartphone")

    # Generic tool (wrench-ish)
    tool = Image.new("RGB", (640, 480), (200, 200, 205))
    t = ImageDraw.Draw(tool)
    t.rectangle((140, 230, 500, 270), fill=(90, 90, 95))
    t.ellipse((110, 200, 190, 300), outline=(70, 70, 75), width=18)
    save("neg_tool", tool, "synthetic elongated tool")

    # Benign human-ish skin oval + shirt
    human = Image.new("RGB", (640, 480), (180, 200, 220))
    h = ImageDraw.Draw(human)
    h.ellipse((260, 60, 380, 200), fill=(220, 180, 150))
    h.rectangle((230, 200, 410, 420), fill=(40, 90, 160))
    save("neg_benign_human", human, "synthetic benign person (no firearm)")

    # Dark / blur
    dark = Image.new("RGB", (640, 480), (8, 8, 8))
    d2 = ImageDraw.Draw(dark)
    d2.rectangle((200, 180, 440, 300), fill=(25, 25, 25))
    dark = dark.filter(ImageFilter.GaussianBlur(radius=6))
    save("neg_dark_blur", dark, "dark/blur low-signal frame")

    # Long black object (cable/umbrella-like)
    long_obj = Image.new("RGB", (640, 480), (230, 230, 230))
    lo = ImageDraw.Draw(long_obj)
    lo.rectangle((120, 230, 520, 255), fill=(15, 15, 15))
    lo.ellipse((500, 210, 560, 275), fill=(20, 20, 20))
    save("neg_long_black", long_obj, "long black object hard negative")

    return specs


def _predict_dino(rgb: np.ndarray) -> dict:
    from app.services.weapon_detector_service import weapon_detector_service

    from PIL import Image as PilImage

    image = PilImage.fromarray(rgb)
    started = time.perf_counter()
    try:
        result = weapon_detector_service.detect_image(image)
        # wall includes service timing; prefer model inference_ms when present
        return {
            "ok": True,
            "predicted": "gun" if any(d.label in {"gun", "pistol", "rifle", "firearm"} and d.score >= 0.42 for d in result.detections) else "miss",
            "score": max((d.score for d in result.detections if d.label in {"gun", "pistol", "rifle", "firearm"}), default=None),
            "latency_ms": result.inference_ms,
            "bbox_count": len(result.detections),
            "error": None,
            "wall_ms": (time.perf_counter() - started) * 1000.0,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "predicted": "error",
            "score": None,
            "latency_ms": None,
            "bbox_count": 0,
            "error": f"{type(exc).__name__}: {exc}",
            "wall_ms": (time.perf_counter() - started) * 1000.0,
        }


def _predict_onnx(rgb: np.ndarray) -> dict:
    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service

    started = time.perf_counter()
    try:
        result = firearm_onnx_detector_service.detect_image_rgb(rgb)
        return {
            "ok": True,
            "predicted": "gun" if any(d.score >= 0.40 for d in result.detections) else "miss",
            "score": max((d.score for d in result.detections), default=None),
            "latency_ms": result.inference_ms,
            "bbox_count": len(result.detections),
            "error": None,
            "wall_ms": (time.perf_counter() - started) * 1000.0,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "predicted": "error",
            "score": None,
            "latency_ms": None,
            "bbox_count": 0,
            "error": f"{type(exc).__name__}: {exc}",
            "wall_ms": (time.perf_counter() - started) * 1000.0,
        }


def _metrics(rows: list[dict], model: str) -> dict:
    subset = [r for r in rows if r["model"] == model and r["predicted"] != "error"]
    tp = fp = fn = tn = 0
    for row in subset:
        exp_pos = row["expected"] == "gun_present"
        pred_pos = row["predicted"] == "gun"
        if exp_pos and pred_pos:
            tp += 1
        elif not exp_pos and pred_pos:
            fp += 1
        elif exp_pos and not pred_pos:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and (precision + recall)
        else None
    )
    lats = sorted(r["latency_ms"] for r in subset if isinstance(r.get("latency_ms"), (int, float)))
    def pct(p: float) -> float | None:
        if not lats:
            return None
        idx = min(len(lats) - 1, max(0, int(round((p / 100.0) * (len(lats) - 1)))))
        return round(lats[idx], 2)

    return {
        "model": model,
        "n": len(subset),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": None if precision is None else round(precision, 3),
        "recall": None if recall is None else round(recall, 3),
        "f1": None if f1 is None else round(f1, 3),
        "p50_latency_ms": pct(50),
        "p95_latency_ms": pct(95),
    }


def _sampling_stress(rgb: np.ndarray, fps: int, seconds: float = 5.0) -> dict:
    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service

    interval = 1.0 / fps
    deadline = time.perf_counter() + seconds
    completed = 0
    skipped = 0
    latencies: list[float] = []
    in_flight = False
    next_t = time.perf_counter()
    while time.perf_counter() < deadline:
        now = time.perf_counter()
        if now < next_t:
            time.sleep(min(0.002, next_t - now))
            continue
        next_t += interval
        if in_flight:
            skipped += 1
            continue
        in_flight = True
        t0 = time.perf_counter()
        firearm_onnx_detector_service.detect_image_rgb(rgb)
        latencies.append((time.perf_counter() - t0) * 1000.0)
        completed += 1
        in_flight = False
    return {
        "fps_target": fps,
        "seconds": seconds,
        "completed": completed,
        "skipped_busy": skipped,
        "p50_latency_ms": round(float(np.median(latencies)), 2) if latencies else None,
        "p95_latency_ms": round(float(np.percentile(latencies, 95)), 2) if latencies else None,
        "max_latency_ms": round(max(latencies), 2) if latencies else None,
        "note": "synthetic busy-drop sampler; not browser UI",
    }


def main() -> int:
    out = _out_dir()
    frames_dir = out / "frames"
    print(f"Output: {out}")

    frames = _download_hf_positives(frames_dir) + _make_negatives(frames_dir)
    mode = os.getenv("FIREARM_AB_MODELS", "both").strip().lower()  # both|onnx|dino
    limit_raw = os.getenv("FIREARM_AB_MAX_FRAMES", "").strip()
    if limit_raw.isdigit():
        frames = frames[: int(limit_raw)]

    models: list[tuple[str, object]] = []
    if mode in {"both", "dino"}:
        models.append(("grounding_dino", _predict_dino))
    if mode in {"both", "onnx"}:
        models.append(("firearm_onnx", _predict_onnx))
    if not models:
        print("FIREARM_AB_MODELS must be both|onnx|dino", file=sys.stderr)
        return 2

    rows: list[dict] = []
    jsonl_path = out / "ab_results.jsonl"
    # Stream rows so a native crash still leaves partial evidence.
    with jsonl_path.open("w", encoding="utf-8") as fh:
        for spec in frames:
            rgb = np.asarray(Image.open(spec.path).convert("RGB"), dtype=np.uint8)
            for model, predict in models:
                pred = predict(rgb)
                row = {
                    "frame_id": spec.frame_id,
                    "expected": spec.expected,
                    "model": model,
                    "predicted": pred["predicted"],
                    "score": pred["score"],
                    "latency_ms": pred["latency_ms"],
                    "bbox_count": pred["bbox_count"],
                    "notes": spec.notes,
                    "error": pred["error"],
                    "wall_ms": pred["wall_ms"],
                }
                rows.append(row)
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                fh.flush()
                print(
                    f"{spec.frame_id:22} {model:16} pred={pred['predicted']:5} "
                    f"score={pred['score']} lat={pred['latency_ms']} err={pred['error']}",
                    flush=True,
                )

    metrics = [_metrics(rows, "grounding_dino"), _metrics(rows, "firearm_onnx")]
    sampling = []
    sample_rgb = np.asarray(Image.open(frames[0].path).convert("RGB"), dtype=np.uint8)
    for fps in (1, 2):
        sampling.append(_sampling_stress(sample_rgb, fps=fps, seconds=5.0))
        print("sampling", sampling[-1])

    summary = {
        "kind": "LOCAL_MINI_EVAL",
        "disclaimer": "Not a scientific benchmark. No YouTube frames. HF samples + synthetic negatives.",
        "metrics": metrics,
        "sampling": sampling,
        "n_frames": len(frames),
        "jsonl": str(jsonl_path),
    }
    summary_path = out / "ab_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Wrote {jsonl_path}")
    print(f"Wrote {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
