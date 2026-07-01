# Smart Livestream PoC

Proof of concept for a smart livestream sales-support system: Browser AR, face registration, gesture/face events, Vietnamese comment intent (PhoBERT bridge optional), and AI sales assistant.

## Quick start (Docker)

```powershell
docker compose up --build
```

| URL | Service |
|-----|---------|
| http://127.0.0.1:5173 | Frontend demo |
| http://127.0.0.1:8000/api/health | Backend health |

See [docs/DOCKER.md](docs/DOCKER.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scope

- **Browser AR** demo (MediaPipe FaceLandmarker in browser — main path).
- **Backend** FastAPI: chat WebSocket, face registration, NLP proxy, AI event feed.
- **Optional ML**: PhoBERT intent API in separate repo `smart-livestream-ml` (rules fallback when down).
- **Legacy CLI** (`main.py`): local OpenCV webcam PoC — optional dev tool.
- Local embeddings in `storage/embeddings/` — no database, no auth.

## Folder Structure

```text
smart-livestream-poc/
├── backend/
│   └── app/                 # FastAPI: chat, NLP proxy, face registration, events
├── frontend/
│   └── src/                 # React demo: Browser AR, sales assistant, commerce
├── face_recognition/
├── gesture_detection/
├── main.py                  # Original local OpenCV CLI (optional dev tool)
├── requirements.txt
├── config/
│   └── settings.py
├── face_registration/
│   └── registrar.py
├── face_recognition/
│   ├── embedding_store.py
│   └── recognizer.py
├── gesture_detection/
│   ├── gesture_detector.py
│   └── gesture_state.py
├── overlay_engine/
│   └── overlay_renderer.py
├── storage/
│   ├── embeddings/
│   │   └── users.json
│   └── captured_faces/
├── utils/
│   ├── camera.py
│   ├── fps_monitor.py
│   ├── geometry.py
│   └── logger.py
├── logs/
│   └── app.log
└── docs/
    ├── DOCKER.md
    ├── DEPLOYMENT.md
    ├── CI_CD.md
    └── limitations.md
```

## CI/CD

GitHub Actions on `main`:

- **CI** — backend pytest, frontend test + build, `docker compose config`
- **Docker Build** — build backend + frontend images (no registry push)

Details: [docs/CI_CD.md](docs/CI_CD.md)

Cloud deploy: [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md)

## Architecture

`main.py` orchestrates the application. It wires together camera input, face recognition, gesture detection, overlays, and logging.

`face_registration` owns webcam-based user registration. It captures multiple face samples for one user, averages the embeddings, and saves the result.

`face_recognition` owns InsightFace model loading, face detection, embedding generation, cosine similarity matching, and local embedding persistence.

`gesture_detection` owns MediaPipe Hands inference and lightweight heuristic gesture classification. Gesture effects are global in this PoC and are not assigned to a specific recognized user.

`overlay_engine` owns all OpenCV drawing logic, including face boxes, usernames, `Unknown`, gesture effects, and the FPS monitor.

`storage` stores local user data. Each user has one `.npy` embedding file. `users.json` stores metadata and file names only.

## Implementation Phases

### Phase 1

1. Open webcam stream.
2. Register a user with multiple face samples.
3. Generate InsightFace embeddings.
4. Average and normalize embeddings.
5. Save the embedding as `storage/embeddings/<username>.npy`.
6. Save metadata in `storage/embeddings/users.json`.
7. Recognize registered users from webcam frames.

### Phase 2

1. Run MediaPipe Hands on webcam frames.
2. Detect `Raise Hand` based on hand landmark height.
3. Detect `Raise Hand` and `Thumbs Up` with MediaPipe Hands.
4. Wave gesture is temporarily disabled. Set `ENABLE_WAVE_GESTURE=true` to re-enable it.
5. Render global gesture effects.
6. Render username and FPS overlays.

### Phase 3

1. Improve multi-face throughput.
2. Tune frame resolution and recognition thresholds.
3. Add optional recognition throttling if needed.
4. Improve gesture heuristics or train a dedicated gesture model in a future phase.

## Setup

Use Python 3.11 or newer.

```bash
cd smart-livestream-poc
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

InsightFace may download its model files on first use.

## Run Locally

Register a user:

```bash
python main.py register --username alice
```

Run real-time recognition and gesture detection:

```bash
python main.py run
```

List registered users:

```bash
python main.py list-users
```

Delete a user:

```bash
python main.py delete-user --username alice
```

Press `Q` or `ESC` to stop webcam windows.

## Configuration

Most tunable values live in `config/settings.py`, including:

- Camera index and resolution.
- InsightFace model name and recognition threshold.
- Registration sample count.
- MediaPipe confidence thresholds.
- Gesture detection thresholds.
- Overlay style.
- Local storage and log paths.

## Docker (Web Dashboard)

Run the web dashboard/control plane with Docker Compose:

```powershell
docker compose up --build
```

- Frontend dashboard: http://127.0.0.1:5173
- Backend API: http://127.0.0.1:8000

### Primary demo path: Browser AR (local FaceLandmarker)

The main demo at `/` runs **Browser AR** entirely in the browser:

- Webcam via `getUserMedia()` on the host
- Face landmarks and effects via MediaPipe **FaceLandmarker** (`@mediapipe/tasks-vision`)
- Effect presets: None, Glasses, Makeup Lite, Full Filter
- Optional debug overlay (FPS, inference timing)

The backend is used for **dashboard services**: chat, AI Event Feed, face registration API, and future identity/events integration — not for rendering the main camera preview.

Shared AR code lives in `frontend/src/features/browser-ar/`. Benchmark harness: `/poc/ar-lab`.

### Optional legacy backend camera APIs

These remain for tests and reference; the **main demo** uses Browser AR in the frontend:

| Path | Status |
|------|--------|
| `POST /api/inference/frame` | Legacy — backend-inferred overlays in browser |
| `GET /video-feed` | Legacy — MJPEG stream with backend OpenCV capture |
| CLI `python main.py run` | Original local OpenCV PoC (not part of web demo) |

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
