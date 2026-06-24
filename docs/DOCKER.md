# Docker Guide

Run the Smart Livestream PoC with Docker Compose while keeping the existing local workflow (`scripts/start-backend.ps1`, `npm run dev`, etc.).

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

Important: the browser runs on your **host machine**, so `VITE_API_BASE_URL` should stay `http://127.0.0.1:8000` (mapped backend port), **not** `http://backend:8000`.

## Demo flow in Docker

1. Start compose.
2. Open http://127.0.0.1:5173
3. Choose an AR effect (None / Glasses / Makeup Lite / Full Filter), optionally enable **Debug**.
4. Click **Start Stream** and allow webcam permission in the browser.
5. Use **Register Face** at `/register-face` for backend face enrollment (still uses browser camera + API).

The main demo runs **Browser AR** locally in the browser (MediaPipe FaceLandmarker). Inference and rendering happen on the client; the backend powers chat, AI Event Feed, and face registration APIs.

**AR Lab** (`/poc/ar-lab`) remains available for engine/mode benchmarks.

### Legacy camera APIs (kept for tests / reference)

| Endpoint / mode | Status |
|-----------------|--------|
| `POST /api/inference/frame` | Legacy browser-camera inference |
| `GET /video-feed` | Legacy backend MJPEG (OpenCV webcam in container) |
| Desktop client events | Experimental — see `desktop_client/README.md` |

These are no longer exposed in the main demo UI.

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

InsightFace downloads models on first run into the `insightface_models` Docker volume. The first startup can take 1–3 minutes.

Check logs:

```powershell
docker compose logs -f backend
```

### Camera / stream modes

Docker on Windows/WSL2 cannot reliably pass the host webcam into Linux containers. The legacy backend `/video-feed` MJPEG endpoint uses OpenCV `VideoCapture(0)` inside the container, so it usually shows **Unable to open webcam** in Docker.

**Recommended Docker mode:** **Browser AR** on the demo page (`/`).

- Browser uses `getUserMedia()` on the host.
- MediaPipe FaceLandmarker runs locally in the browser (~60+ FPS on typical hardware).
- AR effects render on a canvas preview; no frame upload for the main stream.
- Chat and AI Event Feed still use the backend API.

What works in Docker without host webcam passthrough:

- Browser AR main stream
- Chat
- AI Event Feed
- Web face registration (`/register-face`, browser camera + backend API)
- Face profile API
- AR Lab benchmarks (`/poc/ar-lab`)

**Legacy paths** (not in main UI, APIs retained for tests):

- `POST /api/inference/frame` — browser sends JPEG frames for backend inference
- `GET /video-feed` — backend MJPEG when OpenCV can open a local webcam (local non-Docker backend only)

On Linux hosts, optional camera passthrough for legacy MJPEG may be added later with `/dev/video0` device mapping.

### Missing embeddings / face not recognized

Embeddings are stored in `./storage/embeddings` (bind-mounted). Ensure `.npy` files exist on the host and are not committed to git.

### WebSocket chat errors

Chat uses `ws://127.0.0.1:8000/ws/chat/...` derived from `VITE_API_BASE_URL`. If you change the backend port mapping, update `VITE_API_BASE_URL` and restart frontend.

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
