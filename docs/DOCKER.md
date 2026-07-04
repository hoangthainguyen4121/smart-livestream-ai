# Docker Guide

Run the Smart Livestream PoC with Docker Compose. Local scripts (`scripts/start-backend.ps1`, `npm run dev`) remain supported.

Deploy overview: [DEPLOYMENT.md](DEPLOYMENT.md) · CI: [CI_CD.md](CI_CD.md)

## Quick start

From the repository root:

```powershell
docker compose up --build
```

Open:

- Frontend: http://127.0.0.1:5173
- Backend health: http://127.0.0.1:8000/api/health

Stop containers:

```powershell
docker compose down
```

Optional production-like frontend (nginx, port 8080):

```powershell
docker compose --profile prod up --build
```

## Services

| Service | Host URL | Container role |
|---------|----------|----------------|
| `frontend` | http://127.0.0.1:5173 | Vite dev server with hot reload |
| `frontend-prod` (profile) | http://127.0.0.1:8080 | Built React app served by nginx |
| `backend` | http://127.0.0.1:8000 | FastAPI + AI pipeline |
| ML intent (external) | http://127.0.0.1:8010 | **Optional** — `smart-livestream-ml` on host |

Default compose mode is **development-friendly**:

- Frontend bind-mounts `./frontend` for live edits.
- Backend bind-mounts `./storage/embeddings` so registered faces persist across restarts.

## Environment variables

Copy `.env.example` to `.env` if you want custom values:

```powershell
copy .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API/MJPEG/WebSocket base URL used by the browser |
| `CORS_ORIGINS` | Allowed frontend origins for backend CORS |
| `ML_INTENT_API_URL` | PhoBERT ML API URL (backend proxy). Docker default: `http://host.docker.internal:8010` |
| `ML_INTENT_TIMEOUT_SECONDS` | Timeout when calling ML API (default `2`) |
| `VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION` | Frontend-only catalog image matcher (default `false`) |

Important: the browser runs on your **host machine**, so `VITE_API_BASE_URL` should stay `http://127.0.0.1:8000` (mapped backend port), **not** `http://backend:8000`.

## Demo flow in Docker

1. Start compose.
2. Open http://127.0.0.1:5173
3. Choose an AR effect (None / Glasses / Makeup Lite / Full Filter), optionally enable **Debug**.
4. Click **Start Stream** and allow webcam permission in the browser.

The demo runs **Browser AR** locally in the browser (MediaPipe FaceLandmarker). The backend powers chat and NLP proxy only.

## Local non-Docker workflow (unchanged)

Backend:

```powershell
.\scripts\start-backend.ps1
```

Frontend:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

## Troubleshooting

### Frontend fails to resolve `@mediapipe/tasks-vision`

The dev service uses a named Docker volume for `node_modules`. After adding or updating npm dependencies, that volume can be stale.

Rebuild and restart (the dev entrypoint runs `npm ci` on each start):

```powershell
docker compose up --build frontend
```

If the error persists, remove the stale volume once:

```powershell
docker compose down
docker volume rm smart-livestream-poc_frontend_node_modules
docker compose up --build
```

### Port already in use

If port `8000` or `5173` is taken, stop local servers first:

```powershell
.\scripts\stop-backend.ps1
```

Or change compose port mappings, for example `"8001:8000"`, and update `VITE_API_BASE_URL` accordingly.

### CORS / Failed to fetch

- Frontend must use `http://127.0.0.1:8000` (or `localhost`) in `VITE_API_BASE_URL`.
- Ensure `CORS_ORIGINS` includes your frontend origin, for example `http://127.0.0.1:5173`.
- Restart frontend after changing `VITE_API_BASE_URL`.

### Backend starts slowly / healthcheck fails

Check logs:

```powershell
docker compose logs -f backend
```

### Camera / stream

Docker on Windows/WSL2 cannot pass the host webcam into Linux containers reliably. Use **Browser AR** on the demo page — the browser uses `getUserMedia()` on the host and MediaPipe runs locally.

What works in Docker:

- Browser AR main stream
- Chat WebSocket
- Sales assistant / NLP (client-side; backend NLP proxy optional)
- Mock commerce checkout

### WebSocket chat errors

Chat uses `ws://127.0.0.1:8000/ws/chat/...` derived from `VITE_API_BASE_URL`. If you change the backend port mapping, update `VITE_API_BASE_URL` and restart frontend.

### ML intent unavailable (yellow banner)

Expected when `smart-livestream-ml` is not running. Sales assistant uses rules fallback. To enable PhoBERT:

```powershell
# Terminal — smart-livestream-ml repo
python scripts/serve_intent_api.py --model-dir artifacts/phobert_base_combined_hardcases_v2 --port 8010
```

Verify: `curl http://127.0.0.1:8000/api/nlp/health`

### Backend health

```powershell
curl http://127.0.0.1:8000/api/health
docker compose ps
```

## Useful commands

Validate compose file:

```powershell
docker compose config
```

Build images only:

```powershell
docker compose build
```

View logs:

```powershell
docker compose logs -f
```

Rebuild one service:

```powershell
docker compose build backend
docker compose up backend
```
