# Smart Livestream PoC

Local proof of concept for a smart livestream system that combines face recognition and gesture recognition.

## Scope

- Open webcam stream locally.
- Register users by capturing webcam face samples.
- Generate face embeddings with InsightFace.
- Store each user embedding as a separate `.npy` file.
- Keep `users.json` as a lightweight local index only.
- Recognize registered users in real time.
- Display `Unknown` for unregistered faces.
- Detect `Raise Hand` and `Wave Hand` with MediaPipe Hands.
- Render username, gesture effects, and FPS overlays with OpenCV.
- Write application logs to `logs/app.log`.

No database, web app, cloud service, Docker, message queue, authentication, or additional AI model is used in this phase.

## Folder Structure

```text
smart-livestream-poc/
├── main.py
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
    └── limitations.md
```

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
3. Detect `Wave Hand` based on horizontal wrist movement over a short time window.
4. Render global gesture effects.
5. Render username and FPS overlays.

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
