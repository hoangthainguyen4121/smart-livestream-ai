# Firearm detection — MVP final report

**Date:** 2026-08-10  
**Scope:** Finalize production/demo firearm path for Smart Livestream POC.  
**Constraints:** no additional training, no new firearm dataset, no V4, no architecture change.

---

## 1. Problem

Livestream visual safety needs a firearm (gun-family) risk signal that:

- runs on the DemoPage hot path without excessive CPU/RAM
- separates gun detection from COCO knife/scissors sharp-object logic
- warns / marks risk without auto-terminating the session (MVP policy)

---

## 2. Subh775 baseline (PRIMARY)

| Item | Value |
|------|--------|
| Model | Subh775/Firearm_Detection_Yolov8n → ONNX Runtime |
| Flags | `FIREARM_ONNX_ENABLED` / `VITE_FIREARM_ONNX_ENABLED` |
| Threshold | `0.65` (bbox IoU holdout calibration) |
| Role | **MVP primary** when local demo enables firearm ONNX |

Holdout (bbox IoU protocol — not frame max-score):

| Metric | Value |
|--------|------:|
| F1 | ≈ **0.59** |
| AP50 | ≈ **0.45** |
| FP/frame | ≈ **0.17** |

---

## 3. Custom YOLOX attempt

Apache-2.0 YOLOX-Nano custom train was pursued so a permissive-license detector could replace AGPL Subh775 for production later. Weights live outside the repo under `%USERPROFILE%\.cache\smart-livestream-firearm-yolox\`.

---

## 4. V1 dataset failure

Early custom training used a weak / mismatched dataset mix and invalid evaluation shortcuts. Results were not promotion-grade and are archived as failed experiments (keep reports; do not reuse metrics).

---

## 5. Architecture mismatch root cause

V2 training used YOLOX-Nano depth/width **without** `depthwise=True`, so pretrained Nano weights failed to load correctly. Detected via train-failure audit; Exp fixed before V2 retrain.

---

## 6. Corrected V2

After the Exp fix, V2 trained successfully (Kaggle) but holdout remained weak vs Subh775:

| Metric | YOLOX V2 |
|--------|---------:|
| F1 | ≈ **0.29** |
| AP50 | ≈ **0.25** |
| FP/frame | ≈ **1.0** |

Domain gap: FN on rack/multi, person-overlap, long-gun; FP on face/body.

---

## 7. V3 domain adaptation

V3 added targeted domain data (same Nano Exp). Holdout improved:

| Metric | YOLOX V3 |
|--------|---------:|
| F1 | ≈ **0.49** |
| AP50 | ≈ **0.43** |
| FP/frame | ≈ **0.92** |

V2 → V3: F1 **0.29 → 0.49**. Still below Subh775 on F1 and especially FP/frame.

---

## 8. Rack-domain limitation

Dense gunshop / rack walls remain a known miss domain (e.g. holdout t43). Multi-gun audit showed V3 “multi” samples were mostly isolated guns, not packed racks — capacity/NMS/416 were not the primary issue.

---

## 9. V4 data availability blocker

Automated rack search found no freely downloadable, license-clear, rack-representative set suitable for training without manual Google Form / user annotation. Decision: `V4_BLOCKED_KEEP_SUBH775` (see cache `artifacts/v4_rack_audit/`).

---

## 10. Final model selection

| Path | Status |
|------|--------|
| **Subh775 ONNX** | **PRIMARY** (local MVP / DemoPage when firearm flags on) |
| Custom YOLOX V3 | Research harness only (`#/dev/cv-test`, `-EnableYoloxHarness`) |
| Grounding DINO | Fallback if Subh775 unavailable (and YOLOX harness OFF → skip YOLOX) |

**Selection rationale:** Subh775 was chosen from **real holdout performance** (higher F1, much lower FP/frame), **not** because custom training failed technically. YOLOX V3 trained and generalized better than V2, but did **not** outperform the baseline enough for promotion.

### Runtime flags (actual names)

| Flag | Production default | Local `Start-LocalDemo.ps1` |
|------|--------------------|-----------------------------|
| `FIREARM_ONNX_ENABLED` / `VITE_FIREARM_ONNX_ENABLED` | `false` | `true` (Subh775 primary) |
| `FIREARM_YOLOX_ENABLED` / `VITE_FIREARM_YOLOX_ENABLED` | `false` | `false` unless `-EnableYoloxHarness` |
| `WEAPON_DETECTOR_ENABLED` / `VITE_WEAPON_DETECTOR_ENABLED` | `false` | `true` (DINO fallback) |
| `VITE_WEAPON_AUTO_TERMINATE` | `false` | `false` (gate never auto-terminates) |

### Moderation

- Gun-family labels only on weapon gate (`gun` / `pistol` / `rifle` / `firearm`).
- Knife/scissors stay on sharp-object COCO path.
- Policy: warning / confirmed_risk signal — **no** session auto-termination in current MVP code.

### Evidence pointers

- Holdout GT: `scripts/firearm_bbox_eval/gun_bbox_gt.json`
- V3 holdout JSON: `%USERPROFILE%\.cache\smart-livestream-firearm-yolox\artifacts\v3_train\gun_bbox_iou_holdout_v3.json`
- Compare JSON: `%USERPROFILE%\.cache\smart-livestream-firearm-yolox\artifacts\gun_bbox_iou_compare.json`
- V3 weights: `...\artifacts\v3_train\gun_yolox_nano.onnx`
- V4 blocker: `...\artifacts\v4_rack_audit\V4_AUTOMATED_SEARCH_CONCLUSION.json`

### Manual holdout regression (Subh775 @ 0.65, bbox IoU)

Frozen from `gun_bbox_iou_holdout_v3.json` / compare (no threshold retune):

| Clip / frame | Result |
|--------------|--------|
| t14 handheld SMG | Detected (TP, score ≈ 0.89) |
| t35 outdoor rifle | Detected (TP, score ≈ 0.79) |
| t43 rack | Known limitation (partial; multiple FN on dense rack) |
| Breathless hardneg | Mostly clean; isolated face FP at ~104.4 remains documented |
| No Promises benign | Occasional FP possible — not threshold-tuned away |

Temporal gate (`requiredHits=2`) further reduces unacceptable repeated live alerts vs single-frame FP.

---

**FIREARM MVP INTEGRATION COMPLETE**
