from __future__ import annotations

from pydantic import BaseModel, Field


class DesktopEventItem(BaseModel):
    type: str
    username: str = ""
    gesture: str = ""


class DesktopEventsRequest(BaseModel):
    client_id: str = "desktop-camera"
    events: list[DesktopEventItem] = Field(default_factory=list)


class DesktopEventsResponse(BaseModel):
    accepted: int
    stored: int
