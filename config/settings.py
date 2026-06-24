import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


ENABLE_WAVE_GESTURE = _env_bool("ENABLE_WAVE_GESTURE", False)
DUPLICATE_IDENTITY_THRESHOLD = 0.88


@dataclass(frozen=True)
class CameraSettings:
    index: int = 0
    width: int = 1280
    height: int = 720
    fps: int = 30


@dataclass(frozen=True)
class FaceSettings:
    insightface_model: str = "buffalo_l"
    providers: tuple[str, ...] = ("CPUExecutionProvider",)
    detection_size: tuple[int, int] = (640, 640)
    recognition_threshold: float = 0.45
    recognition_interval_frames: int = 5
    registration_samples: int = 12
    registration_sample_interval: int = 5
    min_face_size: int = 60


@dataclass(frozen=True)
class GestureSettings:
    enable_wave_gesture: bool = ENABLE_WAVE_GESTURE
    max_num_hands: int = 2
    detection_confidence: float = 0.6
    tracking_confidence: float = 0.6
    wave_window_seconds: float = 2.5
    wave_min_reversals: int = 2
    wave_min_peak_to_peak: float = 0.055
    wave_min_path_length: float = 0.10
    wave_min_wrist_y: float = 0.18
    wave_max_wrist_y: float = 0.88
    wave_min_span_seconds: float = 0.35
    wave_cooldown_seconds: float = 2.5
    wave_missed_frame_grace: int = 4
    wave_min_samples: int = 10
    wave_max_samples: int = 15
    wave_min_delta: float = 0.006
    raise_hand_y_threshold: float = 0.42
    effect_duration_frames: int = 24


@dataclass(frozen=True)
class StorageSettings:
    root_dir: Path = BASE_DIR / "storage"
    embeddings_dir: Path = BASE_DIR / "storage" / "embeddings"
    captured_faces_dir: Path = BASE_DIR / "storage" / "captured_faces"
    users_index_path: Path = BASE_DIR / "storage" / "embeddings" / "users.json"


@dataclass(frozen=True)
class LoggingSettings:
    log_dir: Path = BASE_DIR / "logs"
    log_file: Path = BASE_DIR / "logs" / "app.log"


@dataclass(frozen=True)
class OverlaySettings:
    font_scale: float = 0.7
    thickness: int = 2
    fps_position: tuple[int, int] = (16, 30)


CAMERA = CameraSettings()
FACE = FaceSettings()
GESTURE = GestureSettings()
STORAGE = StorageSettings()
LOGGING = LoggingSettings()
OVERLAY = OverlaySettings()
