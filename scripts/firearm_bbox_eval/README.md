# Firearm bbox IoU evaluation

## Critique

Frame-level **max score / frame** cannot validate an object detector: it ignores localization and counts a frame “correct” even when boxes are tiny / wrong / flooded. Minimum metrics:

| Requirement | Rule |
|-------------|------|
| GT | Per-instance **bbox** (xyxy) + class |
| Match | Correct class **and** IoU ≥ threshold (default **0.5**) |
| TP | Matched pred↔GT |
| FP | Unmatched prediction |
| FN | Unmatched GT |
| Report | P, R, F1, AP50, avg FP boxes/frame, localization overlays |

## Run

```powershell
python scripts/firearm_bbox_eval/evaluate_gun_bbox_iou.py
# optional:
python scripts/firearm_bbox_eval/evaluate_gun_bbox_iou.py --include-dino
python scripts/firearm_bbox_eval/render_gt_overlays.py
python -m pytest scripts/firearm_bbox_eval/test_bbox_metrics.py -q
```

Videos must exist under `%USERPROFILE%\Downloads\` (same filenames as in `gun_bbox_gt.json`).

## Outputs

- `.local/cv-eval/gun_bbox_iou_compare.json`
- `.local/cv-eval/bbox_iou_examples/` (green=GT, red=pred)
- `%USERPROFILE%\.cache\smart-livestream-firearm-yolox\artifacts\gun_bbox_iou_compare.json`

## DemoPage primary (unchanged)

Subh775 → Custom YOLOX → Grounding DINO
