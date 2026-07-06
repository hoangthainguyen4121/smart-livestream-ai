# Smart Livestream PoC (Thesis V1)

Proof of concept for a smart livestream sales-support demo: Browser AR, product catalog, host-in-the-loop product context, Vietnamese comment intent (PhoBERT bridge optional), sales assistant panel, chat auto-reply, and mock commerce.

## Quick start (Docker)

```powershell
docker compose up --build
```

| URL | Service |
|-----|---------|
| http://127.0.0.1:5173 | Frontend demo |
| http://127.0.0.1:8000/api/health | Backend health |

See [docs/DOCKER.md](docs/DOCKER.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scope (V1)

- **Browser AR** demo (MediaPipe FaceLandmarker in browser).
- **Frontend** React demo: product catalog, pinned/manual camera context, sales NLP, assistant panel, chat, mock checkout.
- **Backend** FastAPI: health, chat WebSocket, NLP proxy to optional ML service.
- **Optional ML**: PhoBERT intent API in separate repo `smart-livestream-ml` (rules fallback when down).
- **Optional camera product recognition**: frontend-only, flag-gated (`VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION`).

Thesis architecture reference: [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md), [docs/RESEARCH_MENTAL_MODEL.md](docs/RESEARCH_MENTAL_MODEL.md).

## Folder Structure

```text
smart-livestream-poc/
├── backend/
│   └── app/                 # FastAPI: health, chat, NLP proxy
├── frontend/
│   └── src/                 # React DemoPage: Browser AR, sales assistant, commerce
├── scripts/                 # Benchmarks (e.g. camera product recognition memory)
├── docs/
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── RESEARCH_MENTAL_MODEL.md
│   ├── DOCKER.md
│   └── DEPLOYMENT.md
└── docker-compose.yml
```

## CI/CD

GitHub Actions on `main`:

- **CI** — backend pytest, frontend test + build, `docker compose config`
- **Docker Build** — build backend + frontend images (no registry push)

Details: [docs/CI_CD.md](docs/CI_CD.md)

Cloud deploy: [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md)

## Local development (without Docker)

**Backend**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 — single DemoPage (Browser AR + sales assistant + chat).

### Start all local services (Windows)

From the repo root, launch frontend, backend, and the sibling PhoBERT NLP service in separate PowerShell windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local-full.ps1
```

| URL | Service |
|-----|---------|
| http://127.0.0.1:5173 | Frontend (Vite) |
| http://127.0.0.1:8000/api/health | Backend (FastAPI) |
| http://127.0.0.1:8010/health | NLP intent API (`../smart-livestream-ml`) |

Optional flags: `-SkipFrontend`, `-SkipBackend`, `-SkipNlp` (rules fallback without ML).

Requires `../smart-livestream-ml` with model artifact `artifacts/phobert_base_combined_hardcases_v3` (falls back to v2 if missing) unless `-SkipNlp` is used.

Local stack prefers **v3** (same as Hugging Face Space). Fallback **v2** if v3 artifact is absent. Older baselines: `phobert_base_combined_hardcases`, `phobert_base_combined`.

## Browser AR demo

The demo runs **Browser AR** entirely in the browser:

- Webcam via `getUserMedia()` on the host
- Face landmarks and effects via MediaPipe **FaceLandmarker** (`@mediapipe/tasks-vision`)
- Effect presets: None, Glasses, Makeup Lite, Full Filter
- Optional debug overlay (FPS, inference timing)

The backend provides **health**, **chat WebSocket**, and **NLP proxy** only.

Shared AR code lives in `frontend/src/features/browser-ar/`.

See [docs/DOCKER.md](docs/DOCKER.md) for environment variables, ML optional service, production profile, and troubleshooting.

## ML intent service (optional)

PhoBERT classification runs in repo **`smart-livestream-ml`**, not in this compose stack.

| Mode | ML required? | Intent classification |
|------|--------------|----------------------|
| Default Docker | No | Regex/rules fallback |
| Full NLP demo | Yes (port 8010) | PhoBERT via backend proxy |

Start ML on host, then backend reaches it at `host.docker.internal:8010` (default in compose). See [docs/phobert_bridge_demo.md](phobert_bridge_demo.md).

Frontend shows a yellow banner when ML is optional but unavailable; red banner when backend is down.

Local scripts (`scripts/start-backend.ps1`, `npm run dev`) remain supported without Docker.
