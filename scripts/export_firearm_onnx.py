#!/usr/bin/env python3
"""One-time: download Subh775 Firearm YOLOv8n .pt and export ONNX outside the repo.

Runtime inference uses onnxruntime only. This script may temporarily import
ultralytics for export — install it in a throwaway venv if needed:

  pip install ultralytics huggingface_hub onnx

Env:
  FIREARM_ONNX_CACHE_DIR  (required) e.g. %USERPROFILE%\\.cache\\smart-livestream-firearm-onnx
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


REPO = "Subh775/Firearm_Detection_Yolov8n"
PT_NAME = "weights/best.pt"
ONNX_NAME = "firearm_yolov8n.onnx"
IMGSZ = 640


def main() -> int:
    cache_raw = os.getenv("FIREARM_ONNX_CACHE_DIR", "").strip()
    if not cache_raw:
        print(
            "FIREARM_ONNX_CACHE_DIR is required "
            "(outside smart-livestream-poc / smart-livestream-ml).",
            file=sys.stderr,
        )
        return 2

    cache = Path(cache_raw).expanduser().resolve()
    cache.mkdir(parents=True, exist_ok=True)
    onnx_out = cache / ONNX_NAME
    if onnx_out.is_file() and os.getenv("FIREARM_ONNX_FORCE_EXPORT", "").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        print(f"ONNX already present: {onnx_out}")
        return 0

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("pip install huggingface_hub", file=sys.stderr)
        return 2

    try:
        from ultralytics import YOLO
    except ImportError:
        print(
            "Export needs ultralytics once: pip install ultralytics onnx\n"
            "Runtime detection does NOT require ultralytics.",
            file=sys.stderr,
        )
        return 2

    pt_path = hf_hub_download(
        repo_id=REPO,
        filename=PT_NAME,
        cache_dir=str(cache / "hf"),
        local_dir=str(cache / "hf-snapshot"),
    )
    print(f"Downloaded PT: {pt_path}")

    model = YOLO(pt_path)
    exported = model.export(
        format="onnx",
        imgsz=IMGSZ,
        simplify=True,
        opset=12,
        dynamic=False,
    )
    exported_path = Path(str(exported))
    if not exported_path.is_file():
        print(f"export_failed: missing {exported_path}", file=sys.stderr)
        return 1

    onnx_out.write_bytes(exported_path.read_bytes())
    print(f"Wrote ONNX: {onnx_out} ({onnx_out.stat().st_size} bytes)")
    print("Set FIREARM_ONNX_ENABLED=true and restart backend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
