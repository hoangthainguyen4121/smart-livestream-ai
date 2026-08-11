# Weapon / gun open-vocabulary detector (Grounding DINO)

Slice: host camera canvas → subsample (~10s interval, drop-if-busy) → local Grounding DINO → gun-family boxes/scores → temporal **Visual Safety** states:

`safe` → `warning` (first gun-family hit) → `confirmed_risk` (≥2 hits / 35s window).

**Not default:** auto session close on gun. Knife/scissors termination stays on COCO. Adult/NSFW stays warning-only.

## Model provenance

| Field | Value |
|-------|--------|
| HF repo | `IDEA-Research/grounding-dino-tiny` |
| Upstream | [IDEA-Research/GroundingDINO](https://github.com/IDEA-Research/GroundingDINO) |
| Pinned revision | `a2bb814dd30d776dcf7e30523b00659f4f141c71` |
| License | Apache-2.0 |
| Architecture | `GroundingDinoForObjectDetection` (Transformers ≥ 4.40) |
| Prompt | `gun. pistol. rifle. firearm. handgun. shotgun. assault rifle. submachine gun. knife. scissors.` |

Cache **must** be outside `smart-livestream-poc` and `smart-livestream-ml`.

## Local setup

```powershell
cd backend
pip install -r requirements-weapon.txt
$env:WEAPON_MODEL_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-weapon"
$env:WEAPON_DETECTOR_ENABLED = "true"
uvicorn app.main:app --reload --port 8000
```

Frontend `.env.local`:

```text
VITE_WEAPON_DETECTOR_ENABLED=true
```

## Real-weight smoke (separate from pytest)

```powershell
$env:NSFW_MODEL_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-nsfw"
$env:WEAPON_MODEL_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-weapon"
python scripts/smoke_cv_pretrained.py
```
