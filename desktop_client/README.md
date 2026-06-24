# Desktop Camera Client (experimental / archived)

Windows-native realtime camera client for Smart Livestream PoC.

> **Note:** The main demo now uses **Browser AR** (`frontend/src/features/browser-ar/`) in the web UI. This desktop client is kept for experimentation and may still publish identity/gesture events to the backend dashboard.

The desktop client owns the webcam locally, runs the existing Python AI stack (OpenCV + InsightFace + MediaPipe), renders a livestream-style 1280x720 window, and can publish identity/gesture events to the Docker backend dashboard.

## Architecture

```text
Main thread (UI)
  -> bounded camera read_latest() at 640x480
  -> MOSSE tracker + livestream overlay compositor
  -> letterboxed 1280x720 canvas
  -> cv2.imshow

Background threads
  -> recognition worker (InsightFace, queue size 1, latest frame only)
  -> event dispatcher (HTTP POST, non-blocking)
  -> optional gesture worker (enabled with G or --gestures)
```

Web app = dashboard/control plane (Browser AR primary)  
Desktop client = experimental archived path for native OpenCV camera + event publishing

## Prerequisites

1. Python 3.9+ on Windows
2. Webcam available on the host (not inside Docker)
3. Docker backend running:

```powershell
cd "D:\Thac Si NTTU\Chuyen de cntt\smart-livestream-poc"
docker compose up --build
```

4. Registered face profiles in `storage/embeddings/` (register via web UI or CLI)

## Install

From repository root:

```powershell
python -m pip install -r requirements.txt
python -m pip install -r desktop_client/requirements.txt
```

## Run

```powershell
.\desktop_client\run.ps1
```

Or manually (recommended defaults):

```powershell
python desktop_client/main.py run --camera-index 0 --width 640 --height 480 --display-width 1280 --display-height 720 --recognition-interval 8 --tracker mosse --no-gestures
```

Options:

```powershell
python desktop_client/main.py run --debug
python desktop_client/main.py run --gestures
python desktop_client/main.py run --tracker csrt
python desktop_client/main.py run --host-handle @hoang
python desktop_client/main.py run --backend-url http://127.0.0.1:8000
```

## Keyboard controls

| Key | Action |
|-----|--------|
| `Q` / `ESC` | Quit |
| `D` | Toggle debug overlay (FPS, timing, bboxes) |
| `G` | Toggle gesture detection (Thumbs Up, Raise Hand) |
| `B` | Toggle face bounding boxes |
| `F` | Toggle fullscreen |

Default mode is clean livestream UI only: title bar, LIVE badge, viewer count, timer, host tag, floating name label, mini event feed, and action badges.

Press `G` during the demo to enable gesture feedback without restarting.

## Livestream overlay

- Capture stays at **640x480** internally for performance
- Display canvas is **1280x720** with letterboxing
- Top-left title: `AI Livestream Demo`
- Red **LIVE** badge + static viewer count (default `128 viewers`)
- Elapsed stream timer
- Bottom-left host tag (default `@hoang`, updates when a known face is recognized)
- Floating name label above tracked face
- Right-side mini **AI Event Feed** panel
- Large temporary badges for **Thumbs Up** and **Raise Hand**

## Performance model

- **Display loop:** bounded `read_latest()` (default `--max-grab 5`), target 25+ FPS with MOSSE
- **Recognition worker:** InsightFace in a background thread, queue size 1 (latest frame only)
- **OpenCV tracker:** MOSSE by default updates label position every display frame between recognitions
- **Gesture worker:** optional, runs every `--gesture-interval` frames (default 4) when enabled
- **Event dispatcher:** HTTP publishing in a background thread (UI never waits on network)

## Verify dashboard integration

1. Start Docker: `docker compose up --build`
2. Open web dashboard: http://127.0.0.1:5173
3. Run desktop client on Windows host
4. Press `G`, then raise hand or show thumbs up / registered face
5. AI Event Feed should show events from the desktop client

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DESKTOP_BACKEND_URL` | `http://127.0.0.1:8000` | Backend API base URL |
| `DESKTOP_CLIENT_ID` | `desktop-camera` | Sent with event batches |
| `DESKTOP_DISPLAY_WIDTH` | `1280` | Display canvas width |
| `DESKTOP_DISPLAY_HEIGHT` | `720` | Display canvas height |
| `DESKTOP_HOST_HANDLE` | `@hoang` | Default host tag |
| `DESKTOP_VIEWER_COUNT` | `128` | Viewer count label |
| `DESKTOP_GESTURE_INTERVAL` | `4` | Gesture worker frame interval |

## Shared storage

Desktop client reads the same embeddings as the backend:

- `storage/embeddings/*.npy`
- `storage/embeddings/users.json`

Register faces in the web UI, then restart the desktop client (or re-run) to reload profiles.

## Gestures

- Raise Hand — enabled when gestures are on
- Thumbs Up — enabled when gestures are on
- Wave — disabled

## Notes

- Browser Camera mode in the web UI remains available but is not the primary demo path.
- Backend MJPEG `/video-feed` still exists for legacy/debug use.
- Wave events are rejected by `POST /api/desktop/events`.
- OpenCV HighGUI cannot hide the mouse cursor reliably on all systems. If a crosshair/plus cursor appears over the preview window, that is an OpenCV limitation; the app requests a normal arrow cursor on Windows when possible.
