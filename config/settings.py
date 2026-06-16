from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


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
    registration_samples: int = 12
    registration_sample_interval: int = 5
    min_face_size: int = 60


@dataclass(frozen=True)
class GestureSettings:
    max_num_hands: int = 2
    detection_confidence: float = 0.6
    tracking_confidence: float = 0.6
    wave_window_size: int = 18
    wave_min_direction_changes: int = 3
    wave_min_horizontal_motion: float = 0.18
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
