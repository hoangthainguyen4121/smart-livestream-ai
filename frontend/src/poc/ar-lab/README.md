# AR Technology Lab

Dedicated browser-side AR feasibility spike for the Smart Livestream PoC.

Route: `/poc/ar-lab`

## Purpose

This area is **not** a product feature. It exists to answer:

1. Is browser AR technically viable?
2. Can we achieve 25–30 FPS?
3. Can AR effects stay attached to the face?
4. Which engine should become the default?
5. Is identity + AR realistic later?

No backend identity, no InsightFace integration, no dashboard analytics integration.

## Modes

| Mode | Purpose |
| --- | --- |
| `raw_camera` | Baseline camera FPS |
| `facelandmarker_debug` | Landmark visualization |
| `glasses_ar` | Simple anchored AR |
| `makeup_lite` | Blush + lipstick polygons |
| `full_filter` | Worst-case combined effects |
| `identity_plus_ar` | Stub for future identity + AR |

## Engines

| Engine | Package |
| --- | --- |
| A (default) | `@mediapipe/tasks-vision` FaceLandmarker |
| B | `@mediapipe/face_mesh` legacy |

### Future optional engine

Engine C (`@tensorflow-models/face-landmarks-detection` + TF.js) is intentionally **not**
included in the initial POC. It can be added later via lazy-loaded dynamic import so optional
dependencies never break the Vite build.

## How to run

From repo root:

```powershell
cd frontend
npm install
npm run dev
```

Open:

`http://127.0.0.1:5173/poc/ar-lab`

## Benchmark procedure

1. Select a mode.
2. Select an engine (except Mode 0).
3. Set subjective tracking/stability if desired.
4. Click **Run 30s benchmark**.
5. Repeat for each mode/engine combination you want to compare.
6. Click **Export report** to copy markdown results.

## Verdict thresholds

- Excellent: >= 30 FPS
- Good: >= 25 FPS
- Acceptable: >= 20 FPS
- Poor: < 20 FPS
