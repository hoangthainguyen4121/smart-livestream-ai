# Smart Livestream AI MVP Demo Script

> **Current primary path:** The main demo at `/` uses **Browser AR** (local MediaPipe FaceLandmarker, effect presets, optional debug overlay). Chat and AI Event Feed still use the backend. Sections below that reference Backend Annotated Stream or Browser Camera describe **legacy** camera modes kept for reference.

This script demonstrates the web MVP:

- Browser AR (primary camera preview)
- Face Recognition (via registration API; identity on AR stream planned)
- Raise Hand Gesture / AI Event Feed (backend events)
- Realtime WebSocket Chat
- Multi-tab chat sync

## 1. Start Backend And Frontend

Open two terminals from the project root.

### Backend

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend should be available at:

```text
http://127.0.0.1:8000
```

Optional health check:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Frontend

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open the app:

```text
http://127.0.0.1:5173
```

## 2. Demo Flow

### Step 1: Open The App

Open `http://127.0.0.1:5173` in the browser.

Expected:

- The Smart Livestream AI MVP page loads.
- The stream shell is visible.
- The Live Chat panel is visible on the right.
- The default display name is `hoang`.

### Step 2: Choose Backend Annotated Stream

Select `Backend Annotated Stream`.

Expected:

- The backend owns the webcam.
- The video appears inside the Main Stream card.
- The status row shows `Backend owns webcam capture` and `Annotated MJPEG stream`.

### Step 3: Show Face Recognition

Stand in front of the camera with a registered face profile.

Expected:

- A bounding box appears around the detected face.
- A recognized username and confidence score appear on the video overlay.
- Unknown faces may show as an unknown label depending on current face profile data.

### Step 4: Raise Hand And Show AI Event Feed

Raise your hand clearly in view of the camera.

Expected:

- A Raise Hand overlay appears on the Backend Annotated Stream.
- The AI Event Feed receives a new gesture event.
- The event shows:
  - time
  - event type, such as `Raise Hand`
  - label, such as `hoang raised hand`

Optional: try Thumbs Up with a clear thumb-up pose.

Expected:

- If the gesture is clear enough, a Thumbs Up overlay may appear.
- The AI Event Feed receives a `Thumbs Up` event when detected.

Note: Wave gesture is temporarily disabled in this demo build.

### Step 5: Open Second Tab And Test Realtime Chat

Open a second browser tab at:

```text
http://127.0.0.1:5173
```

In either tab:

1. Confirm the display name.
2. Type a chat message.
3. Press `Enter` or click `Send`.

Expected:

- The message appears in both tabs.
- Messages are synchronized through the backend chat WebSocket.
- Recent chat history appears when a new tab connects.

## 3. Expected Results

During a successful demo:

- Backend and frontend both start without errors.
- Backend Annotated Stream opens the webcam.
- Face recognition overlays appear on the stream.
- Raise Hand gesture overlay appears when the hand is raised clearly.
- AI Event Feed shows recent Raise Hand and Thumbs Up events.
- Realtime chat works in one tab.
- Realtime chat syncs across two tabs.
- Existing face recognition and chat features continue working while the AI Event Feed is visible.

## 4. Known Limitations

- Wave gesture is temporarily disabled (`ENABLE_WAVE_GESTURE=false`).
- FPS depends on CPU speed, camera resolution, lighting, and current AI inference load.
- The camera can be held by only one mode or process at a time.
- Backend Annotated Stream, Browser Camera + WebSocket Debug, the CLI app, and other camera apps can conflict with each other.
- The AI Event Feed is in-memory only. Events disappear when the backend restarts.
- Chat is in-memory only. Chat history disappears when the backend restarts.
- There is no auth, database, or cloud deployment in this MVP.

## 5. Troubleshooting

### Backend does not start

- Confirm you are running the command from the `backend` directory.
- Confirm dependencies are installed.
- Try:

```powershell
python -m pip install -r requirements.txt
python -m pip install -r backend/requirements.txt
```

Run the backend again:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend does not start

- Confirm you are running the command from the `frontend` directory.
- Install dependencies if needed:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### Video stream does not appear

- Close other browser tabs, CLI processes, or apps that may be using the camera.
- Make sure only one stream mode is using the camera.
- Refresh the browser page after freeing the camera.
- Restart the backend if the camera remains locked.

### Face recognition does not identify the user

- Confirm a face profile has been registered.
- Improve lighting and face the camera directly.
- Move closer to the camera.
- Avoid strong backlight or heavy motion blur.

### Raise Hand does not trigger

- Raise the hand higher and keep it visible for at least a moment.
- Keep the full hand in the camera frame.
- Improve lighting.
- Check that Backend Annotated Stream is selected.

### Thumbs Up does not trigger

- Show a clear thumb-up with other fingers folded.
- Keep the hand in frame and hold the pose briefly.
- Improve lighting.

### AI Event Feed is empty

- Confirm the backend is running.
- Confirm Backend Annotated Stream is active.
- Trigger Raise Hand again.
- Refresh the page.
- Check:

```text
http://127.0.0.1:8000/api/interaction-events/recent
```

### Chat does not sync across tabs

- Confirm both tabs are opened at `http://127.0.0.1:5173`.
- Confirm the backend is running on `127.0.0.1:8000`.
- Refresh both tabs.
- Send a new message after both tabs are connected.
