import os

# InsightFace warmup is slow and unnecessary for unit/API tests.
os.environ.setdefault("SKIP_FACE_RECOGNIZER_WARMUP", "1")
