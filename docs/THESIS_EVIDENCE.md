# THESIS_EVIDENCE — Complete Evidence Inventory

**Official title:**  
**Xây dựng hệ thống hỗ trợ bán hàng thông minh cho livestream ứng dụng trí tuệ nhân tạo và thị giác máy tính**

**Purpose:** Gate every technical claim in the thesis. No ✅ → do not write the claim.  
**Blueprint:** [`THESIS_BLUEPRINT.md`](THESIS_BLUEPRINT.md) · **Checklist:** [`THESIS_BUILD_PLAN.md`](THESIS_BUILD_PLAN.md)  
**Status:** ✅ ready · 🟡 partial · 🔴 missing

**Contribution framing:** Smart livestream **sales support system** (browser-first). PhoBERT = **Module M6 only**. **No desktop client.**

### Thesis subsystems (evidence grouped)

1. **Computer Vision** — AR-*, FR-*, GE-*  
2. **NLU** — PR-*, IC-*  
3. **AI Sales Assistant** — SA-*, CH-*  
4. **Commerce** — CM-*  
5. **Platform** — P-*, T-*

---

## Index

| Registry | Location |
|----------|----------|
| Figures Hình X.Y | BLUEPRINT §1.1 |
| Tables Bảng X.Y | BLUEPRINT §1.2 |
| Screenshots SCR-* | BLUEPRINT §1.3 + §L below |
| Experiments EXP-* | BLUEPRINT §1.4 + §M below |
| References REF-* | BLUEPRINT §1.5 |
| Modules M1–M8 | BLUEPRINT §9 |
| Datasets DS-* | BLUEPRINT §10 |
| Metrics MET-* | BLUEPRINT §11 + §N below |
| Future Work F-* | §K below — **never claim as implemented** |

---

## Evidence row schema

| Field | Description |
|-------|-------------|
| **ID** | Unique evidence ID |
| **Claim** | Wording permitted in thesis |
| **Module** | M1–M8 or Platform |
| **Source code** | Path(s) in PoC or ML project |
| **Screen ID** | SCR-* if UI proof needed |
| **Experiment** | EXP-* |
| **Metrics** | MET-* or measured value |
| **Figure** | Hình X.Y |
| **Table** | Bảng X.Y |
| **Chapter** | Primary section |
| **Status** | ✅ / 🟡 / 🔴 |

---

## A. Platform integration

| ID | Claim | Module | Source code | Screen | Exp | Metrics | Figure | Table | Ch. | St |
|----|-------|--------|-------------|--------|-----|---------|--------|-------|-----|-----|
| P-01 | Hệ thống demo tích hợp AR, chat, trợ lý AI, giỏ hàng trên một giao diện | Platform | `frontend/src/pages/DemoPage.tsx` | SCR-P01 | EXP-01 | — | Hình 4.1 | — | 4.2 | 🔴 |
| P-02 | Bốn route: demo, đăng ký mặt, AR Lab, Sales Lab | Platform | `frontend/src/App.tsx` | SCR-P02 | EXP-01 | — | — | — | 3.3 | 🔴 |
| P-03 | FastAPI: health, chat WS, NLP proxy, events, face registration | Platform | `backend/app/main.py`, `api/*` | SCR-HL01 | EXP-02 | ok JSON | Hình 3.1 | Bảng 3.4 | 3.2 | 🟡 |
| P-04 | Docker Compose triển khai local | Platform | `docker-compose.yml`, `docs/DOCKER.md` | SCR-DK01 | EXP-10 | — | Hình 3.7 | Bảng 4.1 | 3.9 | 🔴 |
| P-05 | Chat và AI events in-memory, mất khi restart | Platform | `chat_manager.py`, `interaction_events.py` | — | EXP-01 | — | — | — | 4.11, 5.3 | ✅ |
| P-06 | Không PostgreSQL, auth, payment gateway thật | Platform | absence; `architecture-v1.md`=proposal | — | review | — | — | Bảng 1.2, 3.3 | 1.3, 3.10 | ✅ |
| P-07 | Build production frontend thành công | Platform | `frontend/package.json` | — | EXP-14 | build OK | — | Bảng 4.1 | 4.1 | ✅ |

---

## B. M1 — Browser AR

| ID | Claim | Source code | Screen | Exp | Metrics | Figure | Table | Ch. | St |
|----|-------|-------------|--------|-----|---------|--------|-------|-----|-----|
| AR-01 | AR FaceLandmarker chạy client-side cho luồng chính | `browser-ar/BrowserArStream.tsx`, `browserArPipeline.ts` | SCR-AR01 | EXP-01 | — | Hình 4.2 | — | 3.4, 4.3 | 🔴 |
| AR-02 | Effects: glasses, makeup_lite, full_filter | `browser-ar/types.ts`, `renderBrowserArEffect.ts` | SCR-AR01 | EXP-01 | — | Hình 3.3 | — | 3.4 | 🔴 |
| AR-03 | Pin product → đổi effect AR | `productCatalogTypes.ts` `mapArEffectTypeToBrowserAr` | SCR-P02 | EXP-01 | — | Hình 3.3 | — | 3.3 | 🔴 |
| AR-04 | AR Lab đo FPS theo mode | `poc/ar-lab/harness/arBenchmarkHarness.ts` | SCR-AR02 | EXP-06 | MET-FPS-* | — | Bảng 4.5 | 4.9 | 🔴 |
| AR-05 | AR Lab không gắn InsightFace identity | `poc/ar-lab/README.md` | — | — | — | — | — | 4.11, 5.3 | ✅ |

---

## C. M2 — Face recognition

| ID | Claim | Source code | Screen | Exp | Figure | Ch. | St |
|----|-------|-------------|--------|-----|--------|-----|-----|
| FR-01 | Đăng ký khuôn mặt multi-pose qua browser (`/register-face`) | `RegisterFacePage.tsx`, `api/face_registration.py`, `web_face_registration.py` | SCR-FR01 | EXP-01 | Hình 4.3 | 3.5, 4.4 | 🔴 |
| FR-02 | Embedding `.npy` + `users.json` local | `face_recognition/embedding_store.py`, `storage/embeddings/` | — | inspect | — | 3.5 | ✅ |
| FR-03 | InsightFace cho detect + match | `face_recognition/recognizer.py` | — | — | Hình 2.1 | 2.2, 3.5 | ✅ |
| FR-04 | Luồng browser-first: không client desktop/native | Absence of `desktop_client/`; registration web-only | — | review | — | 1.3, 3.2 | ✅ |

---

## D. M3 — Gesture recognition

| ID | Claim | Source code | Screen | Exp | Figure | Ch. | St |
|----|-------|-------------|--------|-----|--------|-----|-----|
| GE-01 | Raise Hand, Thumbs Up (MediaPipe heuristic) | `gesture_detection/gesture_detector.py` | SCR-GE01 | EXP-13 | Hình 3.4, 4.10 | 3.5, 4.3 | 🔴 |
| GE-02 | Wave tắt mặc định | `config/settings.py` `ENABLE_WAVE_GESTURE=false` | — | config | — | 4.11 | ✅ |
| GE-03 | Gesture → AI Event Feed | `interaction_events.py`, `AiEventFeedPanel.tsx` | SCR-GE01 | EXP-13 | Hình 4.10 | 3.5, 4.3 | 🔴 |
| GE-04 | Cooldown chống spam event | `interaction_events.py`, `test_interaction_events.py` | — | EXP-07 | — | Bảng 4.6 | 4.10 | ✅ |

---

## E. M4 — Live chat

| ID | Claim | Source code | Screen | Exp | Figure | Ch. | St |
|----|-------|-------------|--------|-----|--------|-----|-----|
| CH-01 | Chat WebSocket theo room | `api/chat.py`, `api/chat.ts`, `ChatPanel.tsx` | SCR-CH01 | EXP-03 | Hình 4.4 | 3.3, 4.5 | 🔴 |
| CH-02 | Sync lịch sử đa tab | `chat_manager.py`, `test_chat_websocket.py` | — | EXP-03, EXP-07 | — | Bảng 4.6 | 4.10 | 🟡 |
| CH-03 | Chat viewer kích hoạt sales pipeline | `DemoPage.tsx` → `processSalesCommentWithMl` | SCR-CH01 | EXP-04 | Hình 3.2 | 4.5 | 🔴 |

---

## F. M5 — Product resolution

| ID | Claim | Source code | Screen | Exp | Table | Ch. | St |
|----|-------|-------------|--------|-----|-------|-----|-----|
| PR-01 | Catalog 10 sản phẩm demo | `product-catalog/products.ts` | SCR-P02 | — | DS-CAT | 1.3, 3.7 | 🟡 |
| PR-02 | Priority: mention → semantic → category → pinned | `productMentionResolver.ts` | SCR-SA01 | EXP-04 | Bảng 3.2 | 3.7, 4.8 | 🔴 |
| PR-03 | TF-IDF cosine trên browser | `product-search/productSearch.ts` | — | EXP-04 | — | 2.4, 3.7 | ✅ |
| PR-04 | Clarification khi ambiguous cùng category | `salesNlpPipeline.ts`, resolver | SCR-SL01 | EXP-04 | Bảng 4.4 | 4.8 | 🟡 |

---

## G. M6 — Intent classification (PhoBERT module)

| ID | Claim | Source code | Screen | Exp | Metrics | Table | Ch. | St |
|----|-------|-------------|--------|-----|---------|-------|-----|-----|
| IC-01 | PhoBERT fine-tune 11 intent, combined split | `smart-livestream-ml/train_phobert.py`, `configs/phobert_base.yaml` | — | EXP-11 | MET-PHO-F1, MET-PHO-ACC | Bảng 4.2 | 2.3, 4.7 | ✅ |
| IC-02 | Baseline TF-IDF+LogReg cùng split | `train_baseline.py`, `baseline_tfidf_logreg_combined/` | — | EXP-11 | MET-TFIDF-F1 | Bảng 4.2 | 4.7 | ✅ |
| IC-03 | Dataset synthetic-heavy; 8 comment thật | `metrics.json` warning, ML README | — | EXP-11 | MET-REAL-N | Bảng 4.7 | 4.7, 5.3 | ✅ |
| IC-04 | ML API `:8010` `/predict-intent` | `smart-livestream-ml/scripts/serve_intent_api.py` | — | EXP-05 | — | Bảng 3.4 | 3.2, 3.6 | ✅ |
| IC-05 | PoC proxy `/api/nlp/predict-intent` | `backend/app/api/nlp.py`, `ml_intent_client.py` | — | EXP-07 | — | Bảng 3.4 | 3.6 | ✅ |
| IC-06 | Hybrid fusion ML + rules | `mlIntentBridge.ts` | SCR-IC01 | EXP-05, EXP-12 | qualitative | Bảng 4.3 | 3.6, 4.7 | 🔴 |
| IC-07 | Hardcases model cải thiện demo phrases | `phobert_base_combined_hardcases/`, `demo_predict_results.txt` | — | EXP-05 | MET-HARD-F1 | Bảng 4.3 | 4.7 | ✅ |
| IC-08 | Map ML intent → PoC intent | `ml_intent_mapper.py` | — | EXP-07 | — | Bảng 2.3 | 3.6 | ✅ |

---

## H. M7 — AI Sales Assistant

| ID | Claim | Source code | Screen | Exp | Figure | Ch. | St |
|----|-------|-------------|--------|-----|--------|-----|-----|
| SA-01 | Pipeline normalize→classify→entity→action→reply | `salesNlpPipeline.ts` | SCR-SA01 | EXP-04 | Hình 3.5 | 3.6, 4.5 | 🔴 |
| SA-02 | Actions AUTO/ESCALATE/INBOX/IGNORE | `actionDecider.ts` | SCR-SA01 | EXP-04 | — | 3.6 | 🟡 |
| SA-03 | Reply template từ catalog, không LLM | `answerGenerator.ts` | SCR-CH01 | EXP-04 | — | 2.4, 3.6 | ✅ |
| SA-04 | Analytics đếm intent | `salesAssistantTypes.ts`, `SalesAssistantPanel.tsx` | SCR-SA01 | EXP-04 | — | 4.5 | 🔴 |
| SA-05 | Commerce actions ASK_PRICE/LINK/PURCHASE | `commerceIntentActions.ts` | SCR-SA01 | EXP-09 | Hình 4.5 | 3.6, 4.6 | 🔴 |
| SA-06 | Sales Lab mô phỏng chat | `poc/sales-lab/SalesLabPage.tsx` | SCR-SL01 | EXP-04 | — | 4.5, 4.8 | 🔴 |

---

## I. M8 — Mock commerce / checkout

| ID | Claim | Source code | Screen | Exp | Figure | Ch. | St |
|----|-------|-------------|--------|-----|--------|-----|-----|
| CM-01 | Cart add/remove/qty/subtotal | `commerce/cartLogic.ts`, `CartPanel.tsx` | SCR-CM01 | EXP-09 | Hình 4.6 | 3.8, 4.6 | 🔴 |
| CM-02 | Checkout form + ship + COD/QR | `CheckoutModal.tsx`, `checkoutService.ts` | SCR-CM02 | EXP-09 | Hình 4.7 | 3.8, 4.6 | 🔴 |
| CM-03 | Order `LS-*`, status cod_confirmed | `checkoutService.ts` | SCR-CM03 | EXP-09 | Hình 4.8 | 3.8, 4.6 | 🔴 |
| CM-04 | Mock QR → pending → paid ~1.5s | `useCommerceCart.ts` | SCR-CM04 | EXP-09 | Hình 4.8 | 4.6 | 🔴 |
| CM-05 | Validation demo-minimal + unit tests | `checkoutService.ts`, `*.test.ts` | — | EXP-08 | MET-TEST-VITEST | Bảng 4.6 | 4.6, 4.10 | ✅ |
| CM-06 | E2E 5 bước chat→checkout | `docs/checkout_demo.md` | SCR-CM* seq | EXP-09 | — | 4.6 | 🔴 |
| CM-07 | Không lưu PII; session browser only | `useCommerceCart.ts`, modal text | — | — | — | 1.3, 5.3 | ✅ |

---

## J. Testing & quality

| ID | Claim | Source code | Exp | Table | Ch. | St |
|----|-------|-------------|-----|-------|-----|-----|
| T-01 | Backend pytest 9 modules | `backend/tests/*.py` | EXP-07 | Bảng 4.6 | 4.10 | 🟡 |
| T-02 | Frontend vitest commerce 10 tests | `commerce/*.test.ts` | EXP-08 | Bảng 4.6 | 4.10 | ✅ |
| T-03 | CI skips backend pytest (root tests/) | `.github/workflows/ci.yml` | review | — | 4.11, 5.3 | ✅ |
| T-04 | NLP proxy tests | `test_nlp_proxy.py` | EXP-07 | Bảng 4.6 | 4.10 | 🟡 |

---

## K. Future Work — DO NOT claim implemented

| ID | Topic | Thesis location only |
|----|-------|---------------------|
| F-01 | PostgreSQL / ORM | §3.10, 5.4 |
| F-02 | OAuth / JWT | §3.10 |
| F-03 | FAQ bot | §3.10 |
| F-04 | Real payment gateway | §3.10, 5.3 |
| F-05 | MLflow / DVC / drift monitoring | §3.10, 5.4 |
| F-06 | Kubernetes / cloud production | §3.10 |
| F-07 | 500+ real labeled comments | 5.4 |
| F-08 | Wave gesture default on | 5.4 optional |
| F-09 | Identity fused with Browser AR | 5.4 |
| F-10 | Persistent cart/orders DB | §3.10 |

---

## L. Screenshot master list

| Screen ID | File | Route | UI state | Chapters | Status |
|-----------|------|-------|----------|----------|--------|
| SCR-P01 | `demo-main-overview.png` | `/` | LIVE + AR + chat + cart | 4.1, PL | 🔴 |
| SCR-P02 | `product-catalog-pinned.png` | `/` | Catalog + pinned product | 3.3, 4.2 | 🔴 |
| SCR-AR01 | `browser-ar-glasses.png` | `/` | glasses effect | 4.2 | 🔴 |
| SCR-AR02 | `ar-lab-benchmark.png` | `/poc/ar-lab` | Benchmark results | 4.9 | 🔴 |
| SCR-FR01 | `register-face-ui.png` | `/register-face` | Mid registration | 4.4 | 🔴 |
| SCR-GE01 | `ai-event-feed-gesture.png` | `/` | Raise Hand event | 4.3 | 🔴 |
| SCR-CH01 | `chat-panel-reply.png` | `/` | Q&A + assistant reply | 4.4, 4.5 | 🔴 |
| SCR-IC01 | `ml-intent-badge.png` | `/` or sales-lab | PhoBERT badge visible | 4.5, 4.7 | 🔴 |
| SCR-SA01 | `sales-assistant-events.png` | `/` | Events + commerce buttons | 4.5 | 🔴 |
| SCR-SL01 | `sales-lab-chat.png` | `/poc/sales-lab` | Lab chat log | 4.8 | 🔴 |
| SCR-CM01 | `cart-with-item.png` | `/` | 1 item in cart | 4.6 | 🔴 |
| SCR-CM02 | `checkout-modal-cod.png` | `/` | Checkout open COD | 4.6 | 🔴 |
| SCR-CM03 | `order-summary-cod.png` | `/` | cod_confirmed | 4.6 | 🔴 |
| SCR-CM04 | `order-summary-qr-paid.png` | `/` | paid after QR | 4.6 | 🔴 |
| SCR-DK01 | `docker-compose-running.png` | terminal | compose up | 4.1 | 🔴 |
| SCR-HL01 | `api-health-json.png` | browser | health JSON | 3.9, PL | 🔴 |

**Storage:** `docs/thesis-screenshots/`

---

## M. Experiment master list

| Exp ID | Objective | Commands / steps | Expected output | Chapter |
|--------|-----------|------------------|-----------------|---------|
| EXP-01 | Platform startup | `docs/demo-script.md` | `/` loads | 4.1–4.2 |
| EXP-02 | Health check | `curl http://127.0.0.1:8000/api/health` | `{"status":"ok"}` | 4.1 |
| EXP-03 | Chat sync | 2 tabs, send message | Both receive | 4.5 |
| EXP-04 | Sales scenarios | Sales Lab + Bảng 4.4 rows | Correct intent/resolution | 4.8 |
| EXP-05 | PhoBERT demo phrases | ML API or `predict_intent.py` | Log top intent | 4.7 |
| EXP-06 | AR FPS | AR Lab 30s × 3 modes | Bảng 4.5 | 4.9 |
| EXP-07 | Backend tests | `cd backend && pytest -q` | All pass | 4.10, PL-E |
| EXP-08 | Frontend tests | `cd frontend && npm test` | 10 pass | 4.10 |
| EXP-09 | E2E checkout | `docs/checkout_demo.md` | Order LS-* | 4.6 |
| EXP-10 | Docker | `docker compose up` | Services up | 4.1 |
| EXP-11 | Read ML metrics | Open `metrics.json` files | Bảng 4.2 values | 4.7 |
| EXP-12 | ML offline fallback | Stop :8010, chat | rules_fallback | 4.7 |
| EXP-13 | Gesture → AI Event Feed | Backend `stream_inference` + `/video-feed` or inference API | Event in feed | 4.3 |
| EXP-14 | Build | `npm run build` | Success | 4.1 |

---

## N. Metrics master list (copy-paste allowed)

| MET ID | Value | Source | Mandatory footnote |
|--------|-------|--------|-------------------|
| MET-PHO-F1 | 0.9726 | `phobert_base_combined/metrics.json` test macro_f1 | Synthetic-heavy + 8 real |
| MET-PHO-ACC | 0.9728 | same test accuracy | same |
| MET-TFIDF-F1 | 0.9818 | `baseline_tfidf_logreg_combined/metrics.json` | same |
| MET-HARD-F1 | 0.9592 | `phobert_base_combined_hardcases/metrics.json` | Demo-tuning trade-off |
| MET-REAL-N | 8 | ML README / v2 | Limitation |
| MET-TEST-VITEST | 10 passed | `npm test` | — |
| MET-TEST-PYTEST | TBD count | EXP-07 log | — |
| MET-FPS-RAW | TBD | EXP-06 | — |
| MET-FPS-GLASSES | TBD | EXP-06 | — |
| MET-FPS-FULL | TBD | EXP-06 | — |

---

## O. Chapter evidence bundles (minimum IDs required before writing)

| Chapter | Required evidence ✅ |
|---------|---------------------|
| **1.1–1.2** | P-06, IC-03 (footnote) |
| **1.3** | P-06, PR-01, CM-07, IC-03, Bảng 1.2 |
| **1.4** | Hình 1.2 only (no code claims) |
| **2.2** | FR-03, GE-01, AR-01, REF-T02, REF-T03 |
| **2.3** | IC-01–IC-03, IC-08, Bảng 2.1, 2.3 |
| **3.2** | P-03, IC-04, IC-05, Hình 3.1 |
| **3.6** | SA-01, IC-06, IC-08, Hình 3.5 |
| **3.8** | CM-01–CM-04, Hình 3.6 |
| **3.10** | F-01–F-10 only |
| **4.3** | AR-01–AR-04, GE-01, GE-03, SCR-AR*, SCR-GE01 |
| **4.5** | CH-01–CH-03, SA-*, IC-06, SCR-CH01, SCR-SA01, SCR-IC01 |
| **4.6** | CM-01–CM-06, SCR-CM* |
| **4.7** | IC-01–IC-03, IC-07, MET-*, Bảng 4.2–4.3 |
| **4.9** | AR-04, EXP-06, MET-FPS-*, Bảng 4.5 |
| **4.10** | T-01, T-02, CM-05, Bảng 4.6 |
| **5.3–5.4** | P-05, IC-03, AR-05, F-* |

---

## P. Statistics (tracking)

| Category | Total | ✅ | 🟡 | 🔴 |
|----------|------:|---:|---:|---:|
| Evidence rows A–J | 46 | 19 | 7 | 20 |
| Screenshots SCR-* | 16 | 0 | 0 | 16 |
| Experiments EXP-* | 14 | 2 | 0 | 12 |
| Figures (drawn) | 12 | 0 | 0 | 12 |
| Metrics MET-* | 9 | 5 | 0 | 4 |

**Last updated:** 2026-06-18

---

## Q. Revision log

| Date | Change |
|------|--------|
| 2026-06-18 | Expanded inventory; official title; cross-ref BLUEPRINT + BUILD_PLAN |
