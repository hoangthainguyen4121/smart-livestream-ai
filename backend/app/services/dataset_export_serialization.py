from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, Iterable, List

EXPORT_SOURCE_JSONL = "approved_intent_correction"
EXPORT_SOURCE_MANIFEST = "approved_intent_corrections"
JSONL_FIELD_ORDER = (
    "sample_id",
    "text",
    "label",
    "source",
    "predicted_label",
    "prediction_confidence",
    "model_id",
    "model_version",
    "correction_created_at",
    "reviewed_at",
)
MANIFEST_FIELD_ORDER = (
    "batch_id",
    "format_version",
    "created_at",
    "record_count",
    "records_sha256",
    "label_counts",
    "source",
)


def _iso8601(value: datetime) -> str:
    return value.isoformat()


def build_jsonl_record(item: Any) -> Dict[str, Any]:
    return {
        "sample_id": str(item.correction_sample_id),
        "text": item.source_comment_text,
        "label": item.final_intent,
        "source": EXPORT_SOURCE_JSONL,
        "predicted_label": item.predicted_intent,
        "prediction_confidence": item.prediction_confidence,
        "model_id": item.model_id,
        "model_version": item.model_version,
        "correction_created_at": _iso8601(item.correction_created_at),
        "reviewed_at": _iso8601(item.reviewed_at),
    }


def serialize_json_object(payload: Dict[str, Any], field_order: Iterable[str]) -> str:
    ordered = {key: payload[key] for key in field_order}
    return json.dumps(ordered, ensure_ascii=False, separators=(",", ":"), sort_keys=False)


def serialize_jsonl_lines(items: List[Any]) -> bytes:
    lines: List[str] = []
    for item in items:
        record = build_jsonl_record(item)
        lines.append(serialize_json_object(record, JSONL_FIELD_ORDER))
    if not lines:
        return b""
    return ("\n".join(lines) + "\n").encode("utf-8")


def compute_label_counts(items: List[Any]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in items:
        label = item.final_intent
        counts[label] = counts.get(label, 0) + 1
    return dict(sorted(counts.items()))


def build_manifest_payload(
    *,
    batch_id: str,
    format_version: str,
    created_at: datetime,
    record_count: int,
    records_sha256: str,
    label_counts: Dict[str, int],
) -> Dict[str, Any]:
    return {
        "batch_id": batch_id,
        "format_version": format_version,
        "created_at": _iso8601(created_at),
        "record_count": record_count,
        "records_sha256": records_sha256,
        "label_counts": label_counts,
        "source": EXPORT_SOURCE_MANIFEST,
    }


def serialize_manifest(payload: Dict[str, Any]) -> bytes:
    text = serialize_json_object(payload, MANIFEST_FIELD_ORDER)
    return (text + "\n").encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
