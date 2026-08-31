from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, TypedDict
from uuid import uuid4

MAX_ROOM_NAME_LENGTH = 80

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TAXONOMY_PATH = _REPO_ROOT / "shared" / "live_room_taxonomy.json"


class RoomCategory(TypedDict):
    id: str
    sort_order: int
    label_vi: str
    label_en: str
    icon_key: str
    commerce_required: bool


class RoomTaxonomy(TypedDict):
    version: int
    default_id: str
    categories: List[RoomCategory]


@lru_cache(maxsize=1)
def load_room_taxonomy() -> RoomTaxonomy:
    with _TAXONOMY_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    categories = sorted(payload["categories"], key=lambda item: int(item["sort_order"]))
    return {
        "version": int(payload["version"]),
        "default_id": str(payload["default_id"]),
        "categories": categories,
    }


def clear_room_taxonomy_cache() -> None:
    load_room_taxonomy.cache_clear()


def get_room_categories() -> List[RoomCategory]:
    return list(load_room_taxonomy()["categories"])


def get_allowed_room_types() -> FrozenSet[str]:
    return frozenset(category["id"] for category in get_room_categories())


def normalize_room_name(name: str) -> str:
    return " ".join(name.strip().split())


def validate_room_type(room_type: str) -> str:
    allowed = get_allowed_room_types()
    normalized = room_type.strip().lower()
    if normalized not in allowed:
        raise ValueError(
            f"Invalid room_type '{room_type}'. Allowed: {', '.join(sorted(allowed))}."
        )
    return normalized


def room_type_requires_commerce(room_type: str) -> bool:
    normalized = validate_room_type(room_type)
    return next(
        bool(category.get("commerce_required", False))
        for category in get_room_categories()
        if category["id"] == normalized
    )


def resolve_room_type_label(room_type: str, *, locale: str = "vi") -> str:
    normalized = (room_type or "").strip().lower()
    taxonomy = load_room_taxonomy()
    for category in taxonomy["categories"]:
        if category["id"] == normalized:
            return category["label_vi"] if locale.startswith("vi") else category["label_en"]
    default_id = taxonomy["default_id"]
    for category in taxonomy["categories"]:
        if category["id"] == default_id:
            return category["label_vi"] if locale.startswith("vi") else category["label_en"]
    return "Tổng hợp" if locale.startswith("vi") else "General"


def generate_room_id(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug = slug[:40].strip("-")
    suffix = uuid4().hex[:8]
    if not slug:
        return f"room-{suffix}"
    return f"{slug}-{suffix}"


def taxonomy_public_dict() -> Dict[str, Any]:
    taxonomy = load_room_taxonomy()
    return {
        "version": taxonomy["version"],
        "default_id": taxonomy["default_id"],
        "categories": get_room_categories(),
    }


# Compatibility names used by existing imports/schemas.
ALLOWED_ROOM_TYPES = get_allowed_room_types()
DEFAULT_ROOM_TYPE = load_room_taxonomy()["default_id"]
