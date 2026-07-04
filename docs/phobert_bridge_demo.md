# PhoBERT Live Intent Bridge (Milestone M1)

Connects the trained PhoBERT model in `smart-livestream-ml` to the Smart Livestream PoC demo via a backend proxy and frontend hybrid classifier.

## Recommended model (2026-07)

| Artifact | Role |
|----------|------|
| `artifacts/phobert_base_combined_hardcases_v2` | **Default for demo** — manual UI eval ~94%; stable commerce/product mentions |
| `artifacts/phobert_base_combined_hardcases_v3` | Experimental — better greetings/chitchat held-out eval; **regresses** thanks, rep-help, short product names (reverted from default) |
| `artifacts/phobert_base_combined_hardcases` | Baseline (v1 hardcases fine-tune) |
| `artifacts/phobert_base_combined` | Original combined train |

## Architecture separation

```
Comment
  → ML intent API (Repo B) — "What does the viewer want?"
  → mlIntentBridge (confidence + label mapping only)
  → ProductContextResolver — "Which product?" (pin/camera/catalog/clarification)
  → Action / reply templates / analytics
```

- **ML** classifies intent only. No pinned/session state in the model.
- **Resolver** binds product context (explicit catalog match beats pin; pin is not used for unrelated generic mentions).
- **Regex** is fallback when ML is unavailable or below confidence threshold.
- No phrase-specific intent patches in the app (training data fixes mislabels).

## Startup order

### Terminal 1 — ML intent API (`smart-livestream-ml`)

```powershell
cd path\to\smart-livestream-ml
python scripts/serve_intent_api.py --model-dir artifacts/phobert_base_combined_hardcases_v2 --port 8010
```

Verify:

```powershell
curl http://127.0.0.1:8010/health
```

### Terminal 2 — PoC backend

```powershell
cd path\to\smart-livestream-poc\backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Optional env:

```text
ML_INTENT_API_URL=http://127.0.0.1:8010
ML_INTENT_TIMEOUT_SECONDS=2
```

Verify proxy:

```powershell
curl http://127.0.0.1:8000/api/nlp/health
curl -X POST http://127.0.0.1:8000/api/nlp/predict-intent -H "Content-Type: application/json" -d "{\"text\":\"còn size M không shop\"}"
```

### Terminal 3 — PoC frontend

```powershell
cd path\to\smart-livestream-poc\frontend
npm run dev
```

Open:

- Main demo: http://127.0.0.1:5173/
- Sales Lab: http://127.0.0.1:5173/poc/sales-lab

### Hybrid confidence rules (M1.1)

| ML intent | Threshold | Notes |
|-----------|-----------|-------|
| Most commerce intents | **≥ 0.50** | Default |
| PRODUCT_INFO | **≥ 0.70** | Blocks false replies on social comments like `hài nhể ?` |
| CHITCHAT / SPAM | **≥ 0.45** | Suppress sales cards earlier |
| ML + regex agree | **≥ 0.40** | e.g. `giá` → ASK_PRICE uses PhoBERT badge when regex agrees |

PRODUCT_INFO also requires a **commerce signal** in the comment (`giá`, `kính`, `màu`, `son`, …). Social reactions fall back to regex/ignore.

1. Frontend sends viewer comment to `POST /api/nlp/predict-intent` (via PoC backend proxy).
2. If ML is available **and** confidence **≥ 0.50**, mapped ML intent drives the sales pipeline.
3. If ML is down or confidence **< 0.50**, existing regex/rule classifier is used (`rules fallback` badge).
4. Product resolution (V2 semantic search) is unchanged.

## Intent mapping (ML → PoC)

| ML intent | PoC intent | Action |
|-----------|------------|--------|
| ASK_PRICE | ASK_PRICE | AUTO_REPLY |
| ASK_VARIANT | ASK_SIZE | AUTO_REPLY |
| ASK_STOCK | ASK_STOCK | AUTO_REPLY |
| ASK_LINK | ASK_LINK | AUTO_REPLY |
| ASK_SHIPPING | ASK_SHIPPING | AUTO_REPLY |
| ASK_PROMOTION | ASK_PROMOTION | AUTO_REPLY |
| PRODUCT_INFO | ASK_PRODUCT_INFO | AUTO_REPLY |
| PURCHASE_INTENT | PURCHASE_INTENT | ESCALATE |
| CHITCHAT | UNKNOWN | IGNORE (no sales card) |
| COMPLAINT | ASK_PRODUCT_INFO | ESCALATE (highlighted) |
| SPAM_TOXIC | UNKNOWN | IGNORE (moderation) |

## Test comments

| # | Comment | Expected ML intent | Notes |
|---|---------|-------------------|-------|
| 1 | `còn size M không shop` | ASK_VARIANT | Maps to ASK_SIZE; badge e.g. `ASK_VARIANT 52%` |
| 2 | `giá bao nhiêu vậy` | ASK_PRICE | Auto price reply |
| 3 | `còn hàng không` | ASK_STOCK | Stock reply |
| 4 | `xin link mua hàng` | ASK_LINK | Link reply |
| 5 | `ship Hà Nội bao lâu` | ASK_SHIPPING | Shipping reply |
| 6 | `có khuyến mãi gì không` | ASK_PROMOTION | Promo reply |
| 7 | `cái son hợp đi tiệc ấy` | PRODUCT_INFO | Product info reply |
| 8 | `chốt 2 cái nha shop` | PURCHASE_INTENT | Escalate banner |
| 9 | `live hôm nay vui quá` | CHITCHAT | No sales event card |
| 10 | `hàng lỗi quá, shop xem lại đi` | COMPLAINT | Escalate / complaint banner |

## Fallback when ML service is down

Stop Terminal 1 (ML API), then send chat messages again.

Expected:

- `GET /api/nlp/health` → `ml_service_status: "unavailable"`
- Chat badge shows **`rules fallback · …`** (red tint)
- Sales Assistant still works via regex/product resolution
- No crash; requests timeout in ~2s then fall back

## UI indicators

- **Chat message badge (yellow):** `ASK_VARIANT 52%` — PhoBERT used
- **Chat message badge (red):** `rules fallback · ASK_PRICE …` — ML low confidence or unavailable
- **Sales Assistant event:** `PhoBERT` / `rules fallback` source badge + optional `ML: ASK_VARIANT`
