from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BoundingBox:
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def width(self) -> int:
        return max(0, self.x2 - self.x1)

    @property
    def height(self) -> int:
        return max(0, self.y2 - self.y1)

    @property
    def area(self) -> int:
        return self.width * self.height

    def clamp(self, frame_width: int, frame_height: int) -> "BoundingBox":
        return BoundingBox(
            x1=max(0, min(self.x1, frame_width - 1)),
            y1=max(0, min(self.y1, frame_height - 1)),
            x2=max(0, min(self.x2, frame_width - 1)),
            y2=max(0, min(self.y2, frame_height - 1)),
        )
