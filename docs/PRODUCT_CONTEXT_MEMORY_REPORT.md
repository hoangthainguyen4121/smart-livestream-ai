# Product Context Memory Report

Generated: 2026-07-01 18:58:41 UTC

Lightweight benchmark for the product context resolver only. **InsightFace is not measured here.**

## Summary

| Metric | Value |
|--------|-------|
| Baseline RSS | 18.86 MB |
| Peak RSS | 19.14 MB |
| Delta RSS | 0.29 MB |
| Iterations | 5,000 |
| Average time / resolution | 0.2011 ms |
| psutil available | yes |

## Notes

- Resolver path: `backend/app/services/product_context_resolver.py`
- Catalog fixture: `backend/tests/fixtures/sample_catalog.json`
- Sample comments: 8 deictic, explicit catalog, pinned fallback, and clarification cases
- Suitable for Railway free tier: pure text matching, no ML model load

## Future work

- Visual product recognition from camera frames using lightweight object detection or visual embeddings
- Face recognition remains local/high-memory optional and is out of scope for this benchmark
