#!/usr/bin/env python3
"""Real-weight smoke for Adult/NSFW + Weapon (Grounding DINO).

Not part of the normal pytest suite. Downloads weights into EXTERNAL caches only.
Does not commit samples or store explicit content.

Usage (PowerShell):
  $env:NSFW_MODEL_CACHE_DIR = "$env:USERPROFILE\\.cache\\smart-livestream-nsfw"
  $env:WEAPON_MODEL_CACHE_DIR = "$env:USERPROFILE\\.cache\\smart-livestream-weapon"
  $env:NSFW_FRAME_GATE_ENABLED = "true"
  $env:WEAPON_DETECTOR_ENABLED = "true"
  python scripts/smoke_cv_pretrained.py
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Prefer external caches before importing services.
os.environ.setdefault(
    "NSFW_MODEL_CACHE_DIR",
    str(Path.home() / ".cache" / "smart-livestream-nsfw"),
)
os.environ.setdefault(
    "WEAPON_MODEL_CACHE_DIR",
    str(Path.home() / ".cache" / "smart-livestream-weapon"),
)
os.environ["NSFW_FRAME_GATE_ENABLED"] = "true"
os.environ["WEAPON_DETECTOR_ENABLED"] = "true"

from PIL import Image  # noqa: E402

from app.services.nsfw_frame_gate_service import (  # noqa: E402
    nsfw_frame_gate_service,
)
from app.services.weapon_detector_service import (  # noqa: E402
    weapon_detector_service,
)


def _rss_mb() -> float | None:
    try:
        import psutil  # type: ignore

        return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
    except Exception:
        try:
            import resource

            # Linux max RSS is KB; on Windows this may be unavailable.
            return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
        except Exception:
            return None


def _dir_size_mb(path: Path) -> float:
    if not path.exists():
        return 0.0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total / (1024 * 1024)


def _solid(color: tuple[int, int, int], size: tuple[int, int] = (448, 448)) -> Image.Image:
    return Image.new("RGB", size, color)


def _pil_to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _fetch_image(url: str, timeout: float = 30.0) -> Image.Image | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "smart-livestream-smoke/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"  fetch failed: {url} -> {exc}")
        return None


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round((p / 100.0) * (len(ordered) - 1)))))
    return ordered[idx]


def smoke_nsfw() -> dict:
    print("\n=== ADULT / NSFW (Falconsai) ===")
    rss_before = _rss_mb()
    t0 = time.perf_counter()
    nsfw_frame_gate_service.ensure_loaded()
    cold_ms = (time.perf_counter() - t0) * 1000.0
    print(f"cold load: {cold_ms:.1f} ms")

    safe = _pil_to_data_url(_solid((180, 190, 200)))
    warm: list[float] = []
    labels: list[str] = []
    for _ in range(5):
        result = nsfw_frame_gate_service.classify_image_base64(safe)
        warm.append(result.inference_ms)
        labels.append(result.label)
        print(
            f"  safe inference label={result.label} "
            f"nsfw={result.nsfw_score:.4f} normal={result.normal_score:.4f} "
            f"ms={result.inference_ms:.1f}"
        )

    rss_after = _rss_mb()
    cache = Path(os.environ["NSFW_MODEL_CACHE_DIR"]).expanduser().resolve()
    return {
        "model": nsfw_frame_gate_service.status().get("loaded_model_id"),
        "revision": nsfw_frame_gate_service.status().get("loaded_revision"),
        "cold_load_ms": round(cold_ms, 1),
        "warm_p50_ms": round(_percentile(warm, 50), 1),
        "warm_p95_ms": round(_percentile(warm, 95), 1),
        "safe_labels": labels,
        "safe_count": len(labels),
        "false_positives_on_solid": sum(1 for label in labels if label == "nsfw"),
        "rss_before_mb": rss_before,
        "rss_after_mb": rss_after,
        "cache_dir": str(cache),
        "cache_size_mb": round(_dir_size_mb(cache), 1),
    }


def smoke_weapon() -> dict:
    print("\n=== WEAPON (Grounding DINO tiny) ===")
    rss_before = _rss_mb()
    t0 = time.perf_counter()
    weapon_detector_service.ensure_loaded()
    cold_ms = (time.perf_counter() - t0) * 1000.0
    print(f"cold load: {cold_ms:.1f} ms")

    # Public Wikimedia Commons / known-safe reference URLs (temporary fetch only).
    cases = [
        (
            "handgun",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Glock_17.png/320px-Glock_17.png",
            {"gun", "pistol", "firearm"},
        ),
        (
            "rifle",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/M1_Garand_rifle_-_USA_-_30-06_-_Arm%C3%A9museum.jpg/320px-M1_Garand_rifle_-_USA_-_30-06_-_Arm%C3%A9museum.jpg",
            {"gun", "rifle", "firearm"},
        ),
        (
            "knife",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Kitchen_knife_WE.jpg/320px-Kitchen_knife_WE.jpg",
            {"knife"},
        ),
        (
            "scissors",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Scissors.jpg/320px-Scissors.jpg",
            {"scissors"},
        ),
        (
            "benign_negative",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg/320px-Eq_it-na_pizza-margherita_sep2005_sml.jpg",
            set(),
        ),
    ]

    observations: list[dict] = []
    warm: list[float] = []
    gun_hits = 0
    knife_hits = 0
    scissors_hits = 0
    false_positives = 0
    misses = 0

    for name, url, expect in cases:
        image = _fetch_image(url)
        if image is None:
            # Fallback synthetic shapes if network blocked.
            if name == "benign_negative":
                image = _solid((40, 120, 40))
            else:
                image = _solid((90, 90, 90), (640, 480))
            print(f"  {name}: using synthetic fallback (network miss)")

        result = weapon_detector_service.detect_image(image)
        warm.append(result.inference_ms)
        labels = {det.label for det in result.detections}
        top = result.detections[0] if result.detections else None
        obs = {
            "case": name,
            "labels": sorted(labels),
            "top": (
                {"label": top.label, "score": round(top.score, 4)} if top else None
            ),
            "inference_ms": round(result.inference_ms, 1),
            "expected_any_of": sorted(expect) if expect else [],
        }
        observations.append(obs)
        print(f"  {name}: {obs}")

        if expect:
            if labels & expect:
                if "knife" in expect and "knife" in labels:
                    knife_hits += 1
                if "scissors" in expect and "scissors" in labels:
                    scissors_hits += 1
                if expect & {"gun", "pistol", "rifle", "firearm"} and labels & {
                    "gun",
                    "pistol",
                    "rifle",
                    "firearm",
                }:
                    gun_hits += 1
            else:
                misses += 1
        else:
            if labels:
                false_positives += 1

    # Warm repeats on solid negative for latency.
    for _ in range(3):
        warm.append(weapon_detector_service.detect_image(_solid((30, 30, 30))).inference_ms)

    rss_after = _rss_mb()
    cache = Path(os.environ["WEAPON_MODEL_CACHE_DIR"]).expanduser().resolve()
    return {
        "model": weapon_detector_service.status().get("loaded_model_id"),
        "revision": weapon_detector_service.status().get("loaded_revision"),
        "prompt": weapon_detector_service.status().get("prompt"),
        "device": weapon_detector_service.status().get("device"),
        "cold_load_ms": round(cold_ms, 1),
        "warm_p50_ms": round(_percentile(warm, 50), 1),
        "warm_p95_ms": round(_percentile(warm, 95), 1),
        "gun_positives_detected": gun_hits,
        "knife_detected": knife_hits,
        "scissors_detected": scissors_hits,
        "misses": misses,
        "false_positives_on_negatives": false_positives,
        "observations": observations,
        "rss_before_mb": rss_before,
        "rss_after_mb": rss_after,
        "cache_dir": str(cache),
        "cache_size_mb": round(_dir_size_mb(cache), 1),
    }


def main() -> int:
    print("CV pretrained real-weight smoke")
    print(f"poc root: {ROOT}")
    before_poc = _dir_size_mb(ROOT)
    ml = ROOT.parent / "smart-livestream-ml"
    before_ml = _dir_size_mb(ml) if ml.exists() else None

    nsfw = smoke_nsfw()
    weapon = smoke_weapon()

    after_poc = _dir_size_mb(ROOT)
    after_ml = _dir_size_mb(ml) if ml.exists() else None

    report = {
        "nsfw": nsfw,
        "weapon": weapon,
        "project_size_mb": {
            "poc_before": round(before_poc, 1),
            "poc_after": round(after_poc, 1),
            "ml_before": round(before_ml, 1) if before_ml is not None else None,
            "ml_after": round(after_ml, 1) if after_ml is not None else None,
        },
    }
    out = Path.home() / ".cache" / "smart-livestream-cv-smoke-report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote report: {out}")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
