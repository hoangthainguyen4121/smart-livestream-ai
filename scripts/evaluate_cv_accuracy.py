"""Local CV accuracy calibration: Firearm ONNX threshold sweep + Adult score audit.

Writes .local/cv-eval/results.json + results.csv. Does not commit media.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

POC_ROOT = Path(__file__).resolve().parents[1]
BACKEND = POC_ROOT / "backend"
sys.path.insert(0, str(BACKEND))

OUT_DIR = POC_ROOT / ".local" / "cv-eval"
GUN_THRESHOLDS = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]

DOWNLOADS = Path.home() / "Downloads"
GUN_VIDEO = DOWNLOADS / (
    "YTDown.com_YouTube_Guns-cheaper-than-smartphones-in-Pakista_Media_MpzrIL5p16U_001_720p.mp4"
)
BREATHLESS = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-Breathless-Video_Media_3HbKnQxd0_E_001_480p.mp4"
)
NO_PROMISES = DOWNLOADS / (
    "YTDown.com_YouTube_Shayne-Ward-No-Promises-Video_Media_HLphrgQFHUQ_001_480p.mp4"
)


@dataclass
class GunFrameRow:
    source: str
    label: str  # positive | negative
    t_sec: float
    max_score: float
    n_dets_raw: int
    latency_ms: float


@dataclass
class AdultFrameRow:
    source: str
    group: str
    t_sec: float
    safe: float
    sexy: float
    porn: float
    hentai: float
    drawing: float
    falconsai_nsfw: float
    top1: str
    latency_ms: float


def _ensure_env() -> None:
    os.environ.setdefault("FIREARM_ONNX_ENABLED", "true")
    os.environ.setdefault(
        "FIREARM_ONNX_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-firearm-onnx"),
    )
    os.environ.setdefault("FIREARM_ONNX_CONF", "0.01")  # raw scores for sweep
    os.environ.setdefault("SUGGESTIVE_CLASSIFIER_ENABLED", "true")
    os.environ.setdefault(
        "SUGGESTIVE_MODEL_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-suggestive"),
    )
    os.environ.setdefault("SUGGESTIVE_LOCAL_FILES_ONLY", "true")
    os.environ.setdefault("NSFW_FRAME_GATE_ENABLED", "true")
    os.environ.setdefault(
        "NSFW_MODEL_CACHE_DIR",
        str(Path.home() / ".cache" / "smart-livestream-nsfw"),
    )


def sample_video(path: Path, times: list[float]) -> list[tuple[float, np.ndarray]]:
    if not path.exists():
        raise FileNotFoundError(path)
    cap = cv2.VideoCapture(str(path))
    frames: list[tuple[float, np.ndarray]] = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if ok and frame is not None:
            frames.append((t, frame))
    cap.release()
    return frames


def solid_frames() -> list[tuple[str, np.ndarray]]:
    out: list[tuple[str, np.ndarray]] = []
    for name, color in [
        ("solid_black", (20, 20, 20)),
        ("solid_gray", (128, 128, 128)),
        ("solid_white", (240, 240, 240)),
        ("solid_blue", (200, 80, 40)),
    ]:
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:] = color
        out.append((name, img))
    # synthetic "phone-like" rectangle
    phone = np.full((480, 640, 3), 180, dtype=np.uint8)
    cv2.rectangle(phone, (220, 80), (420, 400), (40, 40, 40), -1)
    cv2.rectangle(phone, (235, 100), (405, 340), (200, 200, 220), -1)
    out.append(("synthetic_phone", phone))
    # banana-ish yellow blob
    banana = np.full((480, 640, 3), 40, dtype=np.uint8)
    cv2.ellipse(banana, (320, 240), (180, 50), 25, 0, 360, (0, 220, 240), -1)
    out.append(("synthetic_banana", banana))
    # drill-ish dark tool silhouette
    drill = np.full((480, 640, 3), 60, dtype=np.uint8)
    cv2.rectangle(drill, (180, 200), (460, 260), (30, 30, 30), -1)
    cv2.circle(drill, (180, 230), 40, (20, 20, 20), -1)
    out.append(("synthetic_drill", drill))
    return out


def bgr_to_rgb(frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def metrics_at_threshold(rows: list[GunFrameRow], thr: float) -> dict[str, Any]:
    tp = fp = tn = fn = 0
    for row in rows:
        pred = row.max_score >= thr
        pos = row.label == "positive"
        if pred and pos:
            tp += 1
        elif pred and not pos:
            fp += 1
        elif (not pred) and pos:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (
        (2 * precision * recall / (precision + recall))
        if (precision + recall)
        else 0.0
    )
    return {
        "threshold": thr,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "n_pos": tp + fn,
        "n_neg": tn + fp,
    }


def pick_gun_threshold(sweep: list[dict[str, Any]]) -> dict[str, Any]:
    """Prefer FP low + recall >= 0.70; among those max F1; else best F1 with recall>=0.6."""
    candidates = [m for m in sweep if m["recall"] >= 0.70 and m["fp"] <= 2]
    if candidates:
        best = max(candidates, key=lambda m: (m["f1"], -m["fp"], m["precision"]))
        return {"decision": "CALIBRATION SUFFICIENT", "best": best, "rule": "recall>=0.70 & fp<=2"}
    candidates = [m for m in sweep if m["recall"] >= 0.60 and m["precision"] >= 0.80]
    if candidates:
        best = max(candidates, key=lambda m: (m["f1"], -m["fp"]))
        return {"decision": "CALIBRATION SUFFICIENT", "best": best, "rule": "recall>=0.60 & prec>=0.80"}
    best = max(sweep, key=lambda m: (m["f1"], m["recall"], -m["fp"]))
    # If best still has high FP relative to positives or recall collapse
    if best["fp"] >= 3 and best["precision"] < 0.75:
        return {"decision": "FINE-TUNE REQUIRED", "best": best, "rule": "no thr meets FP/recall target"}
    if best["recall"] < 0.55:
        return {"decision": "FINE-TUNE REQUIRED", "best": best, "rule": "recall collapses before FP drops"}
    return {"decision": "CALIBRATION SUFFICIENT", "best": best, "rule": "best-F1 fallback"}


def adult_score_policy(
    scores: dict[str, float],
    falc_nsfw: float,
    *,
    sexy_thr: float,
    porn_suggestive_lo: float,
    porn_suggestive_hi: float,
    porn_explicit: float,
    falc_confirm: float,
) -> str:
    safe = float(scores.get("safe", 0.0) + scores.get("normal", 0.0))
    sexy = float(scores.get("sexy", 0.0))
    porn = float(scores.get("porn", 0.0))
    hentai = float(scores.get("hentai", 0.0))
    drawing = float(scores.get("drawing", 0.0))
    explicit_mass = porn + hentai

    if explicit_mass >= porn_explicit and falc_nsfw >= falc_confirm:
        return "EXPLICIT"
    if explicit_mass >= porn_explicit and explicit_mass >= 0.90:
        return "EXPLICIT"
    if sexy >= sexy_thr and sexy >= safe * 0.5:
        return "SUGGESTIVE"
    if porn_suggestive_lo <= explicit_mass < porn_suggestive_hi and falc_nsfw < falc_confirm:
        return "SUGGESTIVE"
    if explicit_mass >= porn_suggestive_hi and falc_nsfw < falc_confirm:
        # strong porn mass without Falconsai → treat as SUGGESTIVE (music-video FP control)
        # unless extremely high AND safe is tiny
        if explicit_mass >= 0.95 and safe < 0.05 and falc_nsfw >= 0.35:
            return "EXPLICIT"
        return "SUGGESTIVE"
    if safe + drawing >= 0.55 and sexy < sexy_thr and explicit_mass < porn_suggestive_lo:
        return "SAFE"
    return "SAFE"


def sweep_adult_policies(rows: list[AdultFrameRow]) -> dict[str, Any]:
    """Grid-search score policy; prefer Breathless→SUGGESTIVE, safe→SAFE, low EXPLICIT on music video."""
    grid = []
    for sexy_thr in (0.25, 0.35, 0.45):
        for porn_lo in (0.25, 0.35, 0.45):
            for porn_hi in (0.55, 0.70, 0.85):
                if porn_hi <= porn_lo:
                    continue
                for porn_ex in (0.90, 0.95, 0.98):
                    for falc_c in (0.55, 0.70, 0.85):
                        grid.append((sexy_thr, porn_lo, porn_hi, porn_ex, falc_c))

    best = None
    best_score = -1e9
    for sexy_thr, porn_lo, porn_hi, porn_ex, falc_c in grid:
        pred = []
        for r in rows:
            scores = {
                "safe": r.safe,
                "sexy": r.sexy,
                "porn": r.porn,
                "hentai": r.hentai,
                "drawing": r.drawing,
            }
            pred.append(
                adult_score_policy(
                    scores,
                    r.falconsai_nsfw,
                    sexy_thr=sexy_thr,
                    porn_suggestive_lo=porn_lo,
                    porn_suggestive_hi=porn_hi,
                    porn_explicit=porn_ex,
                    falc_confirm=falc_c,
                )
            )
        # Score policy quality
        breathless_idx = [i for i, r in enumerate(rows) if r.group == "breathless_suggestive"]
        safe_idx = [i for i, r in enumerate(rows) if r.group in ("safe_music", "solid_neg")]
        early_breath = [i for i, r in enumerate(rows) if r.group == "breathless_suggestive" and r.t_sec <= 6.0]

        sug = sum(1 for i in breathless_idx if pred[i] == "SUGGESTIVE")
        exp = sum(1 for i in breathless_idx if pred[i] == "EXPLICIT")
        saf_b = sum(1 for i in breathless_idx if pred[i] == "SAFE")
        early_elev = sum(1 for i in early_breath if pred[i] in ("SUGGESTIVE", "EXPLICIT"))
        safe_ok = sum(1 for i in safe_idx if pred[i] == "SAFE")
        safe_fp = sum(1 for i in safe_idx if pred[i] != "SAFE")

        # Objectives: elevate early Breathless, prefer SUGGESTIVE over EXPLICIT, keep safe clean
        score = (
            early_elev * 3.0
            + sug * 2.0
            - exp * 1.5
            - saf_b * 1.0
            + safe_ok * 2.0
            - safe_fp * 4.0
        )
        summary = {
            "sexy_thr": sexy_thr,
            "porn_suggestive_lo": porn_lo,
            "porn_suggestive_hi": porn_hi,
            "porn_explicit": porn_ex,
            "falc_confirm": falc_c,
            "breathless": {"SUGGESTIVE": sug, "EXPLICIT": exp, "SAFE": saf_b, "n": len(breathless_idx)},
            "early_elevated": early_elev,
            "early_n": len(early_breath),
            "safe_ok": safe_ok,
            "safe_fp": safe_fp,
            "safe_n": len(safe_idx),
            "score": score,
        }
        if score > best_score:
            best_score = score
            best = summary

    # Compare vs naive top-1
    naive_exp = naive_sug = naive_safe_b = 0
    for r in rows:
        if r.group != "breathless_suggestive":
            continue
        if r.top1 in ("porn", "hentai"):
            naive_exp += 1
        elif r.top1 == "sexy":
            naive_sug += 1
        else:
            naive_safe_b += 1

    decision = "CALIBRATION SUFFICIENT"
    assert best is not None
    # If early Breathless still mostly SAFE and safe FP high → model issue
    if best["early_elevated"] < max(1, best["early_n"] // 3) and best["safe_fp"] > 2:
        decision = "MODEL/FINE-TUNE REQUIRED"
    if best["breathless"]["SAFE"] > best["breathless"]["SUGGESTIVE"] + best["breathless"]["EXPLICIT"]:
        # still mostly SAFE on suggestive video overall — may be content mix; check early
        if best["early_elevated"] < max(2, best["early_n"] // 2):
            decision = "MODEL/FINE-TUNE REQUIRED"

    return {
        "decision": decision,
        "best_policy": best,
        "naive_top1_breathless": {
            "EXPLICIT": naive_exp,
            "SUGGESTIVE": naive_sug,
            "SAFE": naive_safe_b,
        },
    }


def main() -> int:
    _ensure_env()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    from app.services.firearm_onnx_detector_service import firearm_onnx_detector_service
    from app.services.suggestive_classifier_service import suggestive_classifier_service
    from app.services.nsfw_frame_gate_service import nsfw_frame_gate_service

    # --- Gun sampling ---
    gun_times = [3.5, 4.0, 5.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5, 13.0, 13.5, 14.0, 14.5, 15.0, 15.5, 20.0, 25.0]
    breath_neg_times = [30, 40, 50, 60, 80, 100, 120, 140, 160, 180, 200, 210, 220, 170, 175, 177, 185, 190]
    # face/close-up end of Breathless (user FP zone from user screenshots ~177-183s)
    breath_face_times = [177, 178, 179, 180, 181, 182, 183, 216, 218, 220]
    safe_times = [1, 5, 10, 20, 40, 60, 80, 100]

    gun_rows: list[GunFrameRow] = []

    print("Loading Firearm ONNX...")
    t0 = time.perf_counter()
    # warm
    rgb_warm = np.zeros((480, 640, 3), dtype=np.uint8)
    firearm_onnx_detector_service.detect_image_rgb(rgb_warm)
    print(f"  warm {(time.perf_counter()-t0)*1000:.0f}ms")

    def run_gun(source: str, label: str, t: float, bgr: np.ndarray) -> None:
        rgb = bgr_to_rgb(bgr)
        started = time.perf_counter()
        result = firearm_onnx_detector_service.detect_image_rgb(rgb)
        lat = (time.perf_counter() - started) * 1000
        scores = [float(d.score) for d in result.detections]
        max_score = max(scores) if scores else 0.0
        gun_rows.append(
            GunFrameRow(
                source=source,
                label=label,
                t_sec=t,
                max_score=round(max_score, 4),
                n_dets_raw=len(scores),
                latency_ms=round(result.inference_ms or lat, 2),
            )
        )

    print(f"Sampling gun positives from {GUN_VIDEO.name}...")
    for t, frame in sample_video(GUN_VIDEO, gun_times):
        run_gun("MpzrIL5p16U", "positive", t, frame)

    print("Sampling Breathless negatives (incl. face close-ups)...")
    for t, frame in sample_video(BREATHLESS, sorted(set(breath_neg_times + breath_face_times))):
        run_gun("Breathless", "negative", t, frame)

    print("Sampling No Promises negatives...")
    if NO_PROMISES.exists():
        for t, frame in sample_video(NO_PROMISES, safe_times):
            run_gun("NoPromises", "negative", t, frame)

    print("Synthetic hard negatives...")
    for name, frame in solid_frames():
        run_gun(name, "negative", 0.0, frame)

    sweep = [metrics_at_threshold(gun_rows, thr) for thr in GUN_THRESHOLDS]
    gun_pick = pick_gun_threshold(sweep)

    # score distribution summary
    pos_scores = sorted(r.max_score for r in gun_rows if r.label == "positive")
    neg_scores = sorted(r.max_score for r in gun_rows if r.label == "negative")
    breath_face_scores = sorted(
        r.max_score for r in gun_rows if r.source == "Breathless" and r.t_sec >= 177
    )

    def pct(xs: list[float], p: float) -> float:
        if not xs:
            return 0.0
        k = int(round((len(xs) - 1) * p))
        return xs[k]

    gun_dist = {
        "positive": {
            "n": len(pos_scores),
            "min": pos_scores[0] if pos_scores else 0,
            "p50": pct(pos_scores, 0.5),
            "p90": pct(pos_scores, 0.9),
            "max": pos_scores[-1] if pos_scores else 0,
            "scores": pos_scores,
        },
        "negative": {
            "n": len(neg_scores),
            "min": neg_scores[0] if neg_scores else 0,
            "p50": pct(neg_scores, 0.5),
            "p90": pct(neg_scores, 0.9),
            "max": neg_scores[-1] if neg_scores else 0,
            "gt_040": sum(1 for s in neg_scores if s >= 0.40),
            "gt_050": sum(1 for s in neg_scores if s >= 0.50),
            "gt_055": sum(1 for s in neg_scores if s >= 0.55),
            "gt_060": sum(1 for s in neg_scores if s >= 0.60),
        },
        "breathless_face_zone": {
            "n": len(breath_face_scores),
            "scores": breath_face_scores,
            "gt_040": sum(1 for s in breath_face_scores if s >= 0.40),
            "gt_055": sum(1 for s in breath_face_scores if s >= 0.55),
        },
    }

    # --- Adult audit ---
    print("Loading adult classifiers...")
    adult_rows: list[AdultFrameRow] = []

    def run_adult(source: str, group: str, t: float, bgr: np.ndarray) -> None:
        rgb = bgr_to_rgb(bgr)
        img = Image.fromarray(rgb)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        data_url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        started = time.perf_counter()
        sug = suggestive_classifier_service.classify_image(img)
        falc = nsfw_frame_gate_service.classify_image_base64(data_url)
        lat = (time.perf_counter() - started) * 1000
        scores = {k.lower(): float(v) for k, v in (sug.scores or {}).items()}
        adult_rows.append(
            AdultFrameRow(
                source=source,
                group=group,
                t_sec=t,
                safe=round(scores.get("safe", scores.get("normal", 0.0)), 4),
                sexy=round(scores.get("sexy", 0.0), 4),
                porn=round(scores.get("porn", 0.0), 4),
                hentai=round(scores.get("hentai", 0.0), 4),
                drawing=round(scores.get("drawing", 0.0), 4),
                falconsai_nsfw=round(float(falc.nsfw_score), 4),
                top1=sug.label,
                latency_ms=round(lat, 2),
            )
        )

    # Breathless early suggestive + mid + late
    breath_adult_times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 8.0, 12.0, 30.0, 60.0, 120.0, 142.0, 177.0, 200.0]
    for t, frame in sample_video(BREATHLESS, breath_adult_times):
        run_adult("Breathless", "breathless_suggestive", t, frame)

    if NO_PROMISES.exists():
        for t, frame in sample_video(NO_PROMISES, [1, 5, 10, 20, 40, 80]):
            run_adult("NoPromises", "safe_music", t, frame)

    for name, frame in solid_frames()[:4]:
        run_adult(name, "solid_neg", 0.0, frame)

    # a few gun video frames as non-adult control
    for t, frame in sample_video(GUN_VIDEO, [1.0, 8.0, 14.0]):
        run_adult("MpzrIL5p16U", "safe_music", t, frame)

    adult_pick = sweep_adult_policies(adult_rows)

    # Also evaluate naive top1 vs best calibrated on rows
    bp = adult_pick["best_policy"]
    calibrated_preds = []
    for r in adult_rows:
        calibrated_preds.append(
            adult_score_policy(
                {
                    "safe": r.safe,
                    "sexy": r.sexy,
                    "porn": r.porn,
                    "hentai": r.hentai,
                    "drawing": r.drawing,
                },
                r.falconsai_nsfw,
                sexy_thr=bp["sexy_thr"],
                porn_suggestive_lo=bp["porn_suggestive_lo"],
                porn_suggestive_hi=bp["porn_suggestive_hi"],
                porn_explicit=bp["porn_explicit"],
                falc_confirm=bp["falc_confirm"],
            )
        )

    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "gun": {
            "rows": [asdict(r) for r in gun_rows],
            "distribution": gun_dist,
            "sweep": sweep,
            "pick": gun_pick,
        },
        "adult": {
            "rows": [asdict(r) for r in adult_rows],
            "pick": adult_pick,
            "calibrated_predictions": [
                {"source": r.source, "group": r.group, "t_sec": r.t_sec, "pred": p, "top1": r.top1}
                for r, p in zip(adult_rows, calibrated_preds)
            ],
        },
    }

    json_path = OUT_DIR / "results.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    csv_path = OUT_DIR / "results.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["task", "source", "group_or_label", "t_sec", "metric", "value"])
        for r in gun_rows:
            w.writerow(["gun", r.source, r.label, r.t_sec, "max_score", r.max_score])
        for m in sweep:
            w.writerow(["gun_sweep", "all", m["threshold"], "", "f1", m["f1"]])
            w.writerow(["gun_sweep", "all", m["threshold"], "", "precision", m["precision"]])
            w.writerow(["gun_sweep", "all", m["threshold"], "", "recall", m["recall"]])
            w.writerow(["gun_sweep", "all", m["threshold"], "", "fp", m["fp"]])
        for r in adult_rows:
            w.writerow(["adult", r.source, r.group, r.t_sec, "safe", r.safe])
            w.writerow(["adult", r.source, r.group, r.t_sec, "sexy", r.sexy])
            w.writerow(["adult", r.source, r.group, r.t_sec, "porn", r.porn])
            w.writerow(["adult", r.source, r.group, r.t_sec, "hentai", r.hentai])
            w.writerow(["adult", r.source, r.group, r.t_sec, "falconsai_nsfw", r.falconsai_nsfw])
            w.writerow(["adult", r.source, r.group, r.t_sec, "top1", r.top1])

    print("\n=== GUN SWEEP ===")
    for m in sweep:
        print(
            f"thr={m['threshold']:.2f} TP={m['tp']} FP={m['fp']} FN={m['fn']} TN={m['tn']} "
            f"P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f}"
        )
    print("GUN PICK", json.dumps(gun_pick, indent=2))
    print("GUN DIST pos p50/p90", gun_dist["positive"]["p50"], gun_dist["positive"]["p90"])
    print("GUN DIST neg max / >=0.40 / >=0.55", gun_dist["negative"]["max"], gun_dist["negative"]["gt_040"], gun_dist["negative"]["gt_055"])
    print("FACE ZONE scores", breath_face_scores)

    print("\n=== ADULT PICK ===")
    print(json.dumps(adult_pick, indent=2))
    print(f"\nWrote {json_path}")
    print(f"Wrote {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
