from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from utils.geometry import BoundingBox


@dataclass(frozen=True)
class LetterboxLayout:
    scale: float
    offset_x: int
    offset_y: int
    scaled_width: int
    scaled_height: int
    canvas_width: int
    canvas_height: int
    source_width: int
    source_height: int


def compute_letterbox(
    source_width: int,
    source_height: int,
    canvas_width: int,
    canvas_height: int,
) -> LetterboxLayout:
    if source_width <= 0 or source_height <= 0:
        raise ValueError("Source dimensions must be positive")
    if canvas_width <= 0 or canvas_height <= 0:
        raise ValueError("Canvas dimensions must be positive")

    scale = min(canvas_width / source_width, canvas_height / source_height)
    scaled_width = max(1, int(round(source_width * scale)))
    scaled_height = max(1, int(round(source_height * scale)))
    offset_x = (canvas_width - scaled_width) // 2
    offset_y = (canvas_height - scaled_height) // 2
    return LetterboxLayout(
        scale=scale,
        offset_x=offset_x,
        offset_y=offset_y,
        scaled_width=scaled_width,
        scaled_height=scaled_height,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        source_width=source_width,
        source_height=source_height,
    )


def letterbox_frame(frame: np.ndarray, layout: LetterboxLayout) -> np.ndarray:
    canvas = np.zeros((layout.canvas_height, layout.canvas_width, 3), dtype=np.uint8)
    resized = cv2.resize(
        frame,
        (layout.scaled_width, layout.scaled_height),
        interpolation=cv2.INTER_LINEAR,
    )
    y2 = layout.offset_y + layout.scaled_height
    x2 = layout.offset_x + layout.scaled_width
    canvas[layout.offset_y:y2, layout.offset_x:x2] = resized
    return canvas


def map_point(x: int, y: int, layout: LetterboxLayout) -> tuple[int, int]:
    mapped_x = int(round(x * layout.scale + layout.offset_x))
    mapped_y = int(round(y * layout.scale + layout.offset_y))
    return mapped_x, mapped_y


def map_bbox(bbox: BoundingBox, layout: LetterboxLayout) -> BoundingBox:
    x1, y1 = map_point(bbox.x1, bbox.y1, layout)
    x2, y2 = map_point(bbox.x2, bbox.y2, layout)
    return BoundingBox(x1, y1, x2, y2).clamp(layout.canvas_width, layout.canvas_height)
