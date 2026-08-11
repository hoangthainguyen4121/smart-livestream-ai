# Firearm accuracy + license decision (LOCAL MINI-EVAL)

**Date:** 2026-08-09  
**Scope:** A/B Grounding DINO tiny vs Subh775 Firearm ONNX + permissive-license research.  
**Not:** production switch, deploy, training, YouTube commits.

---

## Bắt buộc phản biện

> Nếu Subh775 thắng accuracy/latency nhưng lineage AGPL, chọn 1/2/3?

**Quyết định:** **(1) research / local-thesis baseline** *và* lập kế hoạch **(3) fine-tune permissive** cho production.  
**Không chọn (2)** làm “solution” hiện tại: không tìm thấy pretrained firearm bbox weights nào vừa **permissive thật** vừa đủ provenance (xem §4). Claim MIT/Apache trên card YOLOv8 **không đủ** khi base Ultralytics là AGPL.

Accuracy thắng **không** đủ để production-switch khi license conflict.

---

## 1. LOCAL MINI-EVAL setup

| Item | Value |
|------|--------|
| Kind | **LOCAL MINI-EVAL** — not a scientific benchmark |
| Positives | 6 HF Subh775 card/sample stills (handheld + val/train mosaics) |
| Negatives | 7 synthetic hard-negs: banana, drill, phone, tool, benign human, dark/blur, long black |
| YouTube `MpzrIL5p16U` frames | **Not in this automated set** (copyright); use `#/dev/cv-test` + **Export A/B JSONL** locally |
| Script | `scripts/run_firearm_ab_minieval.py` |
| Artifacts | `%TEMP%\firearm-ab-minieval\` (ONNX), `%TEMP%\firearm-ab-dino-rows.jsonl` (DINO) |

Thresholds used: DINO gun-family ≥ **0.42**; Firearm ONNX ≥ **0.40**.

---

## 2. Metrics (mini-set)

### Firearm ONNX — 13 frames

| Metric | Value |
|--------|------:|
| TP | 6 |
| FP | 0 |
| FN | 0 |
| TN | 7 |
| Precision | **1.00** |
| Recall | **1.00** |
| F1 | **1.00** |
| p50 latency | **~61 ms** |
| p95 latency | **~62 ms** |

All 6 HF gun stills → `gun` (scores ~0.83–0.92). All 7 hard-negs → `miss`.

### Grounding DINO tiny — 6 frames (subprocess-per-frame; process crashes if multi-frame in one PID)

| frame_id | expected | predicted | score | latency_ms |
|----------|----------|-----------|------:|----------:|
| pos_handheld_sample | gun_present | **miss** | — | ~7967 |
| pos_val0_labels | gun_present | **miss** | — | ~9575 |
| neg_banana | no_gun | miss | — | ~10016 |
| neg_drill | no_gun | **gun** | 0.430 | ~9532 |
| neg_phone | no_gun | **gun** | 0.496 | ~9365 |
| neg_benign_human | no_gun | miss | — | ~9860 |

| Metric | Value |
|--------|------:|
| TP | 0 |
| FP | 2 |
| FN | 2 |
| TN | 2 |
| Precision | **0.00** |
| Recall | **0.00** |
| F1 | **0.00** |
| p50 latency | **~9.5 s** |
| p95 latency | **~10.0 s** |

### Prior manual harness evidence (YouTube, qualitative)

| Frame | DINO | Notes |
|-------|------|--------|
| ~00:44 rack | gun ~0.46 → WARNING | Barely above 0.42 |
| ~00:15 handheld | miss / SCANNING | Same class of FN as mini-eval |
| cordless drill (prior) | pistol ~0.535 FP | Matches mini-eval drill/phone FP pattern |

---

## 3. Sampling (Firearm ONNX only)

Synthetic busy-drop sampler (not browser UI), 5s each:

| Target | Completed | Skipped busy | p50 lat | p95 lat | Max lat |
|--------|----------:|-------------:|--------:|--------:|--------:|
| **1 FPS** | 5 | 0 | ~85 ms | ~299 ms* | ~307 ms |
| **2 FPS** | 10 | 0 | ~94 ms | ~120 ms | ~128 ms |

\*First-iteration warmup spike at 1 FPS. Steady-state ~60–120 ms ⇒ **1–2 FPS is CPU-feasible** with drop-if-busy. Do not raise above 2 FPS in this slice.

UI note: browser `#/dev/cv-test` A/B compare + Export JSONL available for YouTube paused frames.

---

## 4. License / provenance research

### Subh775/Firearm_Detection_Yolov8n (spike candidate)

| Layer | Finding |
|-------|---------|
| HF `cardData.license` | **`agpl-3.0`** (authoritative metadata) |
| README body | Still mentions Apache-2.0 → **conflict; ignore for compliance** |
| `base_model` | Ultralytics/YOLOv8 fine-tune |
| Runtime ONNX | onnxruntime inference **does not remove** Ultralytics AGPL obligations on derivative weights (Ultralytics guidance / issue discussions) |
| Verdict | **AGPL lineage** — OK for research / open thesis demo if AGPL accepted; **not** clear for closed production |

### “Permissive” YOLOv8 firearm cards (e.g. Zcket/gun_dtct)

| Layer | Finding |
|-------|---------|
| Card license | Often **MIT** |
| Architecture | YOLOv8 → Ultralytics AGPL base |
| Verdict | **Not accepted as permissive** without Enterprise or independent legal clearance. README/MIT claim ≠ clean provenance. |

### Best permissive *path* (no ready firearm weights found)

| Piece | License | Notes |
|-------|---------|--------|
| **YOLOX** code + COCO pretrained | **Apache-2.0** | General detector; **no** public firearm fine-tune found |
| **Simuletic/cctv-weapon-dataset** | **CC BY 4.0** | Synthetic `person`+`weapon` YOLO labels; domain = CCTV ≠ selfie livestream |
| Roboflow weapon universes | Often CC BY | Verify each version; still need training |

**Best permissive candidate today:** *none pretrained for firearms*. Closest stack = **YOLOX-S/Nano + Simuletic (+ hard negatives)** after fine-tune.

---

## 5. Custom fine-tune path (plan only — not trained this slice)

| Item | Proposal |
|------|----------|
| Architecture | YOLOX-Nano/S (Apache-2.0) → ONNX Runtime |
| Dataset | Simuletic CCTV weapon (CC BY 4.0) + hard negatives (tools/phones/banana) + later livestream/webcam stills |
| Classes | `weapon` (gun-family); keep knife on COCO sharp path unless dataset covers blades cleanly |
| Effort | Collect/merge labels → train GPU overnight → export ONNX → A/B vs Subh775 baseline on same JSONL harness |
| Risk | CCTV→webcam domain gap; need hard-neg mining |

---

## 6. Decision matrix

| Option | Accuracy (mini-eval) | Latency | License | Integration | Decision |
|--------|----------------------|---------|---------|-------------|----------|
| DINO tiny | Poor (0 TP / 2 FP on 6 frames; manual YouTube flaky) | ~8–10 s | Apache-2.0 (HF IDEA-Research) | Already in POC | Keep as **fallback / open-vocab** only |
| Subh775 ONNX | Strong on mini-set (P=R=1.0 / 13 frames) | ~60–120 ms | **AGPL** | Spike ready on `#/dev/cv-test` | **Local/thesis demo only** |
| Best permissive pretrained | N/A — **not found** | — | — | — | Blocked |
| Custom fine-tune (YOLOX+Simuletic) | TBD | Expected ~tens–low hundreds ms CPU | Apache + CC BY data | Medium effort | **Production path** |

---

## 7. Final decision

### **B. USE AGPL ONNX FOR LOCAL/THESIS DEMO ONLY**

| Context | Action |
|---------|--------|
| **Local thesis / demo** | Prefer Firearm ONNX on `#/dev/cv-test` (and optional DemoPage **dev flag later**). Document AGPL. Do **not** claim production-safe license. |
| **Production / commercial / closed Railway** | **No production-switch.** Keep DINO or disable gun auto-path until **D** (YOLOX fine-tune) or Ultralytics Enterprise. |

**Not chosen now**

- **A** alone — would ignore clear accuracy/latency win for thesis demo.  
- **C** — no verified permissive pretrained firearm weights.  
- **D as sole choice** — correct *next production* work, but does not unlock the demo this week; track as **follow-up slice**.

### Constraints respected

- DINO not deleted  
- No auto-terminate  
- No deploy / no train  
- No copyrighted videos committed  
- No production-safe license claim  

### Implemented local demo path (updated)

`Start-LocalDemo.ps1` sets in **child processes only** (repo defaults stay `false`):

- `FIREARM_ONNX_ENABLED` + `VITE_FIREARM_ONNX_ENABLED` (**DemoPage primary**, thr **0.65**)
- `FIREARM_YOLOX_ENABLED` + `VITE_FIREARM_YOLOX_ENABLED` (A/B + fallback if Subh775 missing, thr **0.02**)
- `WEAPON_DETECTOR_ENABLED` + `VITE_WEAPON_DETECTOR_ENABLED` (DINO fallback)

DemoPage order: **Subh775 → Custom YOLOX → Grounding DINO → unavailable**.

**Why not YOLOX primary live:** Bbox IoU@0.5 eval (`scripts/firearm_bbox_eval/`) shows YOLOX F1=0 / AP50=0 / avgFP≈2.75 vs Subh775 F1≈0.59 / AP50≈0.45 / avgFP≈0.17. Prior frame max-score F1 is **INVALID** for localization. Keep YOLOX on `#/dev/cv-test` A/B only until bbox quality improves.

No production/Railway deploy in this slice.

---

## How to reproduce

```powershell
# ONNX mini-eval
$env:FIREARM_ONNX_ENABLED='true'
$env:FIREARM_ONNX_CACHE_DIR="$env:USERPROFILE\.cache\smart-livestream-firearm-onnx"
$env:FIREARM_AB_MODELS='onnx'
python scripts\run_firearm_ab_minieval.py

# YouTube frames: open #/dev/cv-test → pause → Compare both → Export A/B JSONL
```

**FINAL:** `FIREARM ACCURACY + LICENSE DECISION READY`
