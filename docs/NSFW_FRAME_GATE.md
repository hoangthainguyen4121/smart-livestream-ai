# Adult/NSFW frame-gate (Falconsai, local)

Slice: camera frame → subsample → local NSFW adapter → normalized result → temporal evidence → **warning state**.

**Not in this slice:** auto session close, deploy, training, weapon/violence, violation image storage.

## Architecture decision

| Option | Verdict |
|--------|---------|
| Frontend Transformers.js | Rejected — no Transformers runtime; ~340 MB ViT cannot ship in the Vite bundle |
| Hugging Face hosted Inference API | Rejected — frames would leave the trust boundary |
| **Local FastAPI backend** | **Selected** — same machine / self-hosted process; async classify; UI uses drop-if-busy |

Exact integration points:

1. **Capture:** `BrowserArStream` canvas via `getCanvasElement()` in `DemoPage.tsx` (same canvas as object detector).
2. **Subsample + client policy:** `frontend/src/features/nsfw-frame-gate/*`
3. **HTTP:** `POST /api/nsfw/classify-frame`, `GET /api/nsfw/status`
4. **Inference:** `backend/app/services/nsfw_frame_gate_service.py` (threadpool; no HF remote API)
5. **UI warning:** `VisualModerationBanner` (warning only — does **not** call `reportModerationViolation`)

Backend-authoritative terminate can reuse the sharp-object path later; this slice stops at warning.

## Model provenance (verified 2026-08-04)

| Field | Value |
|-------|--------|
| Repository | `Falconsai/nsfw_image_detection` |
| Pinned revision | `04367978d3474804ab1a00a9bd6548b741764069` |
| Architecture | `ViTForImageClassification` (`model_type: vit`) |
| Labels | `0=normal`, `1=nsfw` |
| Model-card / weight license | **Apache-2.0** (HF `cardData.license`) |
| Config `transformers_version` | `4.31.0` (require `transformers>=4.31`) |
| Custom remote code | **No** (`trust_remote_code=False`; standard ViT) |
| Approx. size | ~85.8M float32 params (~340 MB safetensors) |
| Training data | Proprietary ~80k images (`normal`/`nsfw`) — **disclosed as proprietary**, not redistributed |

Provenance of the training corpus is not public (proprietary), but the **weight license and architecture are verified from the live model card + `config.json`**. Research accepted this tradeoff; implementation pins revision and refuses in-repo caches.

## Setup (local)

```powershell
cd "D:\Thac Si NTTU\Chuyen de cntt\smart-livestream-poc\backend"
.\.venv\Scripts\activate   # or your venv
pip install -r requirements-nsfw.txt

# Cache OUTSIDE the project (example):
$env:NSFW_MODEL_CACHE_DIR = "$env:USERPROFILE\.cache\smart-livestream-nsfw"
$env:NSFW_FRAME_GATE_ENABLED = "true"
$env:NSFW_MODEL_REVISION = "04367978d3474804ab1a00a9bd6548b741764069"

uvicorn app.main:app --reload --port 8000
```

Frontend `.env.local`:

```text
VITE_NSFW_FRAME_GATE_ENABLED=true
VITE_API_BASE_URL=http://127.0.0.1:8000
```

First classify downloads weights into `NSFW_MODEL_CACHE_DIR` (not into the Git tree).

## API

`GET /api/nsfw/status` — enabled/ready/cache/model metadata (safe to call when disabled).

`POST /api/nsfw/classify-frame`

```json
{ "imageBase64": "data:image/jpeg;base64,...", "clientTimestampMs": 0 }
```

Response includes `label`, `nsfw_score`, `normal_score`, `is_nsfw`, revision, and always `auto_terminates_session: false`, `stores_violation_images: false`.

## Tests

```powershell
cd backend
pytest tests/test_nsfw_frame_gate.py -q

cd ..\frontend
npm test -- src/features/nsfw-frame-gate/nsfwFrameGatePolicy.test.ts
```
