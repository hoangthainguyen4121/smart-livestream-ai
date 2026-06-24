# AI Sales Assistant

Applied AI workflow for livestream commerce in the Smart Livestream PoC demo.

Route: main demo at `/` and dedicated lab at `/poc/sales-lab`.

## v1 design decision: rule-based NLP pipeline, not trained ML

Version 1 intentionally uses **rule-based intent detection**, not a trained NLP model or external LLM.

Reasons:

- No real livestream comment dataset exists yet in this project.
- The goal is to prove the **system workflow** first: detect intent → retrieve product → generate reply → log analytics → recommend host actions.
- Rule-based v1 is fast, explainable, and good enough for demo comments like `giá?`, `xin link`, `mình mua`.

This is an applied AI system architecture, not a research training pipeline.

## Current workflow (frontend-only, in-memory)

```text
Viewer chat comment
  → normalizeText (slang + punctuation)
  → productMentionResolver (explicit mention → semantic search → category → pinned)
  → intentClassifier (patterns + confidence)
  → entityExtractor (color, size, qty, shipping)
  → actionDecider (AUTO / INBOX / ESCALATE / IGNORE)
  → answerGenerator (catalog-only templates)
  → SalesAssistantPanel event + analytics
  → optional simulated chat reply (AI Sales Assistant)
```

Module: `frontend/src/features/sales-nlp/`  
Semantic search: `frontend/src/features/product-search/`  
Catalog: `frontend/src/features/product-catalog/` (10 dummy products)

Actor: **AI Sales Assistant**

## Product resolution priority (v2)

The NLP pipeline resolves which catalog product a comment refers to **before** generating a reply.

Priority order:

1. **Mentioned product** — explicit product name, tag, or strong catalog keyword match
2. **Semantic product search** — TF-IDF vector similarity over enriched product documents (`frontend/src/features/product-search/`)
3. **Category match** — category-level mention such as `son`, `kính`, `tai nghe`
4. **Pinned product fallback** — only when the comment does not mention any product signal

Semantic search runs locally in the browser (no backend, no LLM). Each product document combines name, category, description, tags, selling points, and curated use-case terms (e.g. `đi tiệc`, `da dầu`, `bluetooth`).

Event metadata includes:

- `resolutionSource`: `mentioned_product` | `semantic_search` | `category_match` | `pinned_product` | `ambiguous`
- `semanticSimilarity` (0–1) when semantic search is used
- `searchDiagnostics.matchReasons` — overlapping terms that explain the match

### Semantic search technology choice (V2 POC)

| Option | Verdict |
|--------|---------|
| **MiniSearch / Fuse.js (A)** | Fast and tiny (~10KB), but lexical only — weak on paraphrases like `sản phẩm cho da dầu` unless every synonym is hand-authored |
| **Transformers.js (B)** | True neural embeddings, but ~25–120MB model download and slow cold start — too heavy for this demo |
| **Browser embedding API (C)** | Not consistently available offline; adds platform dependency |

**Chosen for V2:** lightweight **TF-IDF cosine similarity** over enriched product documents — zero extra bundle size, instant startup, explainable match reasons, sufficient for 10–100 products. Neural embeddings (Transformers.js) remain the planned upgrade when the catalog and paraphrase diversity grow.

Additional rules:

- If the pinned product belongs to the mentioned category (e.g. pinned `lipstick-ruby` + comment mentions `son`), prefer the pinned product.
- If multiple products in the same category match with close scores, ask a clarification question (e.g. `Bạn đang hỏi mẫu son nào ạ?`).
- Comparison comments (`kính với son cái nào rẻ hơn`) resolve **multiple matched products** across categories instead of forcing the pinned product.

Each event includes product resolution metadata:

- `resolutionSource`: `mentioned_product` | `pinned_product` | `category_match` | `ambiguous` | `none`
- `selectedProductId`
- `productConfidence`
- `matchedProducts`

Example:

| Pinned | Comment | Expected resolution |
|--------|---------|---------------------|
| `crown-accessory` | `son thì bao nhiêu tiền hả bạn?` | lipstick product, `category_match` or `mentioned_product` |
| `crown-accessory` | `giá?` | `crown-accessory`, `pinned_product` |
| `lipstick-ruby` | `son giá bao nhiêu?` | `lipstick-ruby`, `category_match` |
| `crown-accessory` | `kính với son cái nào rẻ hơn?` | compare glasses + lipstick, not crown only |

## Supported intents (v1)

| Intent | Example phrases | Action |
|--------|-----------------|--------|
| `ASK_PRICE` | `giá?`, `bao nhiêu?`, `mặt hàng này giá bao nhiêu?` | `AUTO_REPLY_SUGGESTED` |
| `ASK_STOCK` | `còn hàng không?`, `còn bao nhiêu?` | `AUTO_REPLY_SUGGESTED` |
| `ASK_COLOR` | `còn màu đen không?`, `màu gì?` | `AUTO_REPLY_SUGGESTED` |
| `ASK_LINK` | `xin link`, `cho link` | `AUTO_REPLY_SUGGESTED` |
| `COMPARE_PRODUCTS` | `kính với son`, `cái nào rẻ hơn`, `so sánh` | `AUTO_REPLY_SUGGESTED` |
| `PURCHASE_INTENT` | `mua`, `chốt`, `đặt hàng`, `ship cho mình` | `ESCALATE_TO_HOST` |
| `UNKNOWN` | unrelated chat | no auto-reply |

Each detection returns:

- `intent`
- `confidence` (0–0.99)
- `matchedPatterns`
- `selectedProductId`
- `resolutionSource`
- `productConfidence`
- `matchedProducts`
- `action`

## Product catalog (POC)

10 dummy products across glasses, lipstick, accessory, skincare, electronics, and fashion.

Default pinned product: `glasses-a`

Code: `frontend/src/features/product-catalog/`

## Feature module layout

```text
frontend/src/features/product-search/
├── buildProductDocument.ts
├── productEmbedding.ts
├── productSearch.ts
├── productSearchTypes.ts
└── searchDiagnostics.ts

frontend/src/features/sales-nlp/
├── normalizeText.ts
├── productMentionResolver.ts
├── intentClassifier.ts
├── entityExtractor.ts
├── answerGenerator.ts
├── actionDecider.ts
└── salesNlpPipeline.ts

frontend/src/features/sales-assistant/
├── processSalesComment.ts
├── SalesAssistantPanel.tsx
└── PinnedProductPanel.tsx
```

## Analytics (in-memory)

Tracked per demo session:

- total product questions
- price / stock / color / link question counts
- purchase intent count
- unknown comment count (internal)
- most asked product id
- AI recommendation strings for the host

## What v1 does NOT do

- No database persistence
- No cart, payment, or order flow
- No external LLM calls
- No real inbox / Messenger / Zalo integration
- No model training

## Future upgrades (planned)

| Phase | Upgrade |
|-------|---------|
| a | LLM / RAG over product catalog for richer replies |
| b | Trained intent classifier when real livestream comment data is collected |
| c | Real inbox integration (host approval queue) |
| d | Database persistence for events and analytics |
| e | Order / cart / payment module |

Backend integration for sales events is **Phase 2** — current POC is frontend-only.

## How to test

1. Start frontend: `cd frontend && npm run dev`
2. Open http://127.0.0.1:5173
3. Use live chat (backend optional for chat WS; sales assistant works without backend logic)

Example inputs:

| Comment | Expected |
|---------|----------|
| `giá?` (pinned crown) | `ASK_PRICE`, pinned product, `resolutionSource=pinned_product` |
| `son thì bao nhiêu tiền hả bạn?` (pinned crown) | `ASK_PRICE`, lipstick product, `category_match` |
| `cái son hợp đi tiệc ấy` (pinned crown) | `semantic_search` → Son Ruby Đỏ |
| `kính chống nắng` | Kính chống nắng Urban |
| `tai nghe bluetooth` | Tai nghe Bluetooth Mini |
| `sản phẩm cho da dầu` | Kem chống nắng SPF50 |
| `kính với son cái nào rẻ hơn?` | `COMPARE_PRODUCTS`, matched glasses + lipstick |
| `còn màu đen không?` | `ASK_COLOR`, color reply |
| `xin link` | `ASK_LINK`, product link reply |
| `mình mua` | `PURCHASE_INTENT`, `ESCALATE_TO_HOST`, buyer banner |
| `hello` | `UNKNOWN`, no auto-reply |
