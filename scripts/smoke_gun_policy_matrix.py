#!/usr/bin/env python3
"""Threshold matrix for gun-family Grounding DINO (external cache, not pytest).

Writes report to %USERPROFILE%\\.cache\\smart-livestream-gun-policy-matrix.json
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

os.environ.setdefault(
    "WEAPON_MODEL_CACHE_DIR",
    str(Path.home() / ".cache" / "smart-livestream-weapon"),
)
os.environ["WEAPON_DETECTOR_ENABLED"] = "true"
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from PIL import Image  # noqa: E402

from app.services.weapon_detector_service import weapon_detector_service  # noqa: E402

GUN_FAMILY = {"gun", "pistol", "rifle", "firearm"}
THRESHOLDS = (0.42, 0.45, 0.50)
TMP = Path(os.environ.get("TEMP", str(Path.home() / "AppData" / "Local" / "Temp"))) / "sl-cv-smoke"


def _rss_mb() -> float | None:
    try:
        import psutil  # type: ignore

        return round(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024), 1)
    except Exception:
        return None


def top_gun(dets, thr: float):
    best = None
    for d in dets:
        if d.label not in GUN_FAMILY:
            continue
        if d.score < thr:
            continue
        if best is None or d.score > best.score:
            best = d
    return best


def main() -> int:
    files = {
        "handgun": TMP / "handgun.png",
        "handgun2": TMP / "handgun2.png",
        "rifle": TMP / "rifle.png",
        "banana": TMP / "banana.jpg",
        "drill_mislabelled_scissors": TMP / "scissors.jpg",
        "scissors_photo_as_knife": TMP / "knife.jpg",
        "solid_neg": None,
    }

    print("load model...", flush=True)
    t0 = time.perf_counter()
    weapon_detector_service.ensure_loaded()
    cold_ms = (time.perf_counter() - t0) * 1000
    rss_after_load = _rss_mb()

    raw_obs = []
    latencies = []
    for name, path in files.items():
        if path is None:
            img = Image.new("RGB", (448, 448), (40, 40, 40))
        elif not path.exists():
            print(f"skip missing {name}: {path}", flush=True)
            continue
        else:
            img = Image.open(path).convert("RGB")
            w, h = img.size
            m = max(w, h)
            if m > 960:
                s = 960 / m
                img = img.resize((int(w * s), int(h * s)))

        r = weapon_detector_service.detect_image(img)
        latencies.append(r.inference_ms)
        gun_dets = [
            {"label": d.label, "score": round(d.score, 3)}
            for d in r.detections
            if d.label in GUN_FAMILY
        ]
        by_thr = {
            str(thr): (
                {"label": top.label, "score": round(top.score, 3)}
                if (top := top_gun(r.detections, thr))
                else None
            )
            for thr in THRESHOLDS
        }
        row = {
            "case": name,
            "inference_ms": round(r.inference_ms, 1),
            "gun_family_raw": gun_dets[:5],
            "pass_by_threshold": by_thr,
        }
        raw_obs.append(row)
        print(row, flush=True)

    # Simulated temporal: banana FP should not reach confirmed_risk alone.
    temporal = {}
    for thr in THRESHOLDS:
        hits = []
        for row in raw_obs:
            top = row["pass_by_threshold"][str(thr)]
            if top:
                hits.append(top)
        # Dedup identical fingerprints (label|score)
        uniq = []
        seen = set()
        for h in hits:
            fp = f"{h['label']}|{h['score']}"
            if fp in seen:
                continue
            seen.add(fp)
            uniq.append(h)
        state = "safe"
        if len(uniq) >= 2:
            state = "confirmed_risk"
        elif len(uniq) == 1:
            state = "warning"
        temporal[str(thr)] = {"unique_gun_hits_across_cases": len(uniq), "state_if_all_in_window": state}

    latencies_sorted = sorted(latencies)
    report = {
        "cold_load_ms": round(cold_ms, 1),
        "warm_p50_ms": round(latencies_sorted[len(latencies_sorted) // 2], 1) if latencies_sorted else None,
        "warm_p95_ms": (
            round(latencies_sorted[int(0.95 * (len(latencies_sorted) - 1))], 1)
            if latencies_sorted
            else None
        ),
        "rss_mb_after_load": rss_after_load,
        "device": weapon_detector_service.status().get("device"),
        "sampling_note": "UI interval 10s + drop-if-busy; effective rate ~1 / inference_latency",
        "observations": raw_obs,
        "temporal_across_matrix": temporal,
        "policy_recommendation": {
            "threshold": 0.42,
            "hits": 2,
            "window_ms": 35000,
            "warning": "first gun-family hit",
            "auto_terminate": False,
        },
    }
    out = Path.home() / ".cache" / "smart-livestream-gun-policy-matrix.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", out, flush=True)
    print(json.dumps(report["policy_recommendation"], indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
