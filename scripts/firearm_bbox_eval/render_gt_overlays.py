#!/usr/bin/env python3
"""Render GT boxes onto frames for human QA of gun_bbox_gt.json."""

from __future__ import annotations

import json
from pathlib import Path

import cv2

POC = Path(__file__).resolve().parents[2]
GT = Path(__file__).resolve().parent / "gun_bbox_gt.json"
DOWNLOADS = Path.home() / "Downloads"
OUT = Path.home() / ".cache" / "smart-livestream-firearm-yolox" / "bbox_gt_qa"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    data = json.loads(GT.read_text(encoding="utf-8"))
    for fr in data["frames"]:
        video = DOWNLOADS / fr["video_file"]
        if not video.exists():
            print("MISSING", video)
            continue
        cap = cv2.VideoCapture(str(video))
        cap.set(cv2.CAP_PROP_POS_MSEC, float(fr["timestamp_sec"]) * 1000.0)
        ok, bgr = cap.read()
        cap.release()
        if not ok:
            continue
        for i, box in enumerate(fr.get("boxes", [])):
            x1, y1, x2, y2 = [int(v) for v in box["xyxy"]]
            cv2.rectangle(bgr, (x1, y1), (x2, y2), (0, 220, 0), 2)
            cv2.putText(
                bgr,
                f"gt{i}",
                (x1, max(18, y1 - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 220, 0),
                2,
            )
        out = OUT / f"{fr['id']}_gt.jpg"
        cv2.imwrite(str(out), bgr)
        print("wrote", out.name, "n_gt", len(fr.get("boxes", [])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
