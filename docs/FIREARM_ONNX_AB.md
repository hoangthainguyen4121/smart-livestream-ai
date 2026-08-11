# Firearm ONNX A/B spike (vs Grounding DINO)

DEV harness only: `#/dev/cv-test`. Does **not** production-switch DemoPage away from Grounding DINO.

## Critique answer (candidate)

**Selected:** [`Subh775/Firearm_Detection_Yolov8n`](https://huggingface.co/Subh775/Firearm_Detection_Yolov8n)

| Field | Evidence |
|-------|----------|
| Weights | `weights/best.pt` ≈ **6.24 MB** (HF LFS) |
| Classes | **1× `Gun`** (pistols/rifles/shotguns unified) |
| Input | **640×640** |
| Card metrics | mAP@0.5 **0.890**, recall **0.824** (author-reported) |
| HF `license` YAML | **`agpl-3.0`** (Ultralytics YOLOv8 derivative; README body still mentions Apache — treat as **AGPL** for product) |
| ONNX Runtime without Ultralytics? | **Yes at inference.** One-time export may use `ultralytics` in a throwaway env; runtime loads `.onnx` via `onnxruntime` only (`ultralytics_runtime: false` in status). |

No cleaner Apache + public firearm bbox + small ONNX candidate beat this for the spike. AGPL is a **product gate**, not a blocker for local A/B accuracy evidence.

## Prepare

```powershell
cd backend
pip install -r requirements-firearm-onnx.txt
# one-time export helper (needs ultralytics once):
pip install ultralytics onnx
$env:FIREARM_ONNX_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-firearm-onnx"
python ..\scripts\export_firearm_onnx.py

# enable spike API
$env:FIREARM_ONNX_ENABLED = "true"
# keep DINO available too
$env:WEAPON_DETECTOR_ENABLED = "true"
$env:WEAPON_MODEL_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-weapon"
```

## A/B on `#/dev/cv-test`

1. Choose gun video / stills locally (do not commit copyrighted media).
2. Toggle **Gun detector:** Grounding DINO | Firearm ONNX.
3. ONNX auto sample: **1 FPS** or **2 FPS**.
4. Pause presets (~00:15, ~00:44, drill, banana, benign, tool) → **Compare both on current frame**.
5. Fill table → read Decision helper (advisory only).

## Decision labels

- `KEEP DINO`
- `REPLACE DINO WITH FIREARM ONNX`
- `PRETRAINED FIREARM MODEL INSUFFICIENT → DATASET/FINE-TUNE REQUIRED`

Decision after LOCAL MINI-EVAL + license research: see **`docs/FIREARM_AB_LICENSE_DECISION.md`**.

Summary: **B — USE AGPL ONNX FOR LOCAL/THESIS DEMO ONLY** (not production-safe). Production path = permissive YOLOX fine-tune later.

## API

- `GET /api/weapon/firearm-onnx/status`
- `POST /api/weapon/firearm-onnx/detect-frame` — warning-only (`auto_terminates_session: false`)
