# Camera Product Recognition Memory Report

Generated: 2026-07-01 19:22:21 UTC

Lightweight catalog-scoped camera product recognition benchmark. **InsightFace / face recognition are not measured here.**

## Summary

| Metric | Value |
|--------|-------|
| Baseline RSS | 36.5 MB |
| Peak RSS | 37.72 MB |
| Delta RSS | 1.23 MB |
| Catalog products tested | 3 |
| Frames tested | 120 |
| Average recognition time | 6.8285 ms |
| psutil available | yes |

## Comparison

| Feature | Delta RSS |
|---------|-----------|
| Product context resolver | ~0.29 MB |
| Camera product recognition | 1.23 MB |

## Notes

- Matcher path: `backend/app/services/camera_product_matcher.py`
- Catalog fixture: `backend/tests/fixtures/sample_catalog.json`
- Uses dHash + color histogram against catalog product images only
- Feature flags default to **disabled** on Railway/cloud:
  - `VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION=false`
  - `CAMERA_PRODUCT_RECOGNITION_ENABLED=false`

## Future work

- Replace lightweight matcher with YOLO / CLIP / visual embeddings behind explicit feature flags
- Face recognition remains optional/high-memory and out of scope for this benchmark
