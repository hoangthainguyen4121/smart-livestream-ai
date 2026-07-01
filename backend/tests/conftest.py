import os

# Default off — InsightFace warmup is memory-heavy and skipped in CI/Railway.
os.environ.setdefault("FACE_RECOGNITION_WARMUP", "false")
