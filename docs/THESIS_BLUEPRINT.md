# THESIS BLUEPRINT — Complete Design Document

**Official title:**  
**Xây dựng hệ thống hỗ trợ bán hàng thông minh cho livestream ứng dụng trí tuệ nhân tạo và thị giác máy tính**

**Master Word template:** `Document/4. Biểu mẫu Tiểu luận - Đồ án.docx`  
**Evidence inventory:** `docs/THESIS_EVIDENCE.md`  
**Execution checklist:** `docs/THESIS_BUILD_PLAN.md`  
**Organizing principle:** Problem → Solution → Architecture → Implementation → Evaluation  
**Status:** Blueprint only — **do not write thesis body until BUILD_PLAN Phase 1 complete**

---

## 0. Thesis identity

### 0.1 Contribution statement (use in Ch.1, Ch.5, both presentations)

Integrated **smart livestream sales support system** combining:

| # | Capability | Role in title keywords |
|---|------------|------------------------|
| 1 | Browser AR try-on | *Thị giác máy tính* |
| 2 | Face recognition | *Thị giác máy tính* |
| 3 | Gesture recognition | *Thị giác máy tính* |
| 4 | PhoBERT intent classification | *Trí tuệ nhân tạo* (one module) |
| 5 | Product resolution (TF-IDF + rules) | *Hỗ trợ bán hàng thông minh* |
| 6 | AI Sales Assistant | *Hỗ trợ bán hàng thông minh* |
| 7 | Live chat | *Livestream* |
| 8 | Mock commerce / checkout | *Bán hàng* (demo scope) |

PhoBERT alone is **not** the thesis contribution. **No desktop/native client** is part of this system.

### 0.2 Browser-first architecture (AS-IS)

```text
Browser / React frontend
  ↓  WebSocket chat · Browser AR · Sales UI · Commerce UI
FastAPI backend
  ↓  Face registration · Interaction events · NLP proxy
PhoBERT intent service (:8010)
  ↓  Hybrid bridge in AI Sales Assistant
Product resolution · Reply · Cart · Mock checkout
```

Removed from codebase: `desktop_client/`, `POST /api/desktop/events`.

### 0.3 Thesis subsystems (five only — no desktop)

| Subsystem | Components |
|-----------|------------|
| **1. Computer Vision** | Browser AR · Face recognition (web registration) · Gesture recognition (backend + event feed) |
| **2. Natural Language Understanding** | PhoBERT intent · Rule fallback · Product resolution |
| **3. AI Sales Assistant** | Intent-to-action · Reply · Analytics · Event feed |
| **4. Commerce** | Cart · Checkout · Mock payment · Order summary |
| **5. Platform** | React · FastAPI · ML bridge · Docker/local |

### 0.4 Document map

| Artifact | Purpose |
|----------|---------|
| `THESIS_BLUEPRINT.md` | What to write (this file) |
| `THESIS_EVIDENCE.md` | Proof for every claim |
| `THESIS_BUILD_PLAN.md` | Step-by-step completion order |
| `THESIS_OUTLINE.md` | Short outline + presentation mapping |
| `docs/thesis-screenshots/` | Captured UI evidence (create folder) |
| `docs/thesis-figures/` | Exported diagrams (draw.io / PNG) |

### 0.5 Page budget (target ~75–95 pages body, excluding cover/appendix)

| Chapter | Pages |
|---------|------:|
| Ch.1 | 10–12 |
| Ch.2 | 16–20 |
| Ch.3 | 22–26 |
| Ch.4 | 24–28 |
| Ch.5 | 6–8 |
| **Total body** | **78–94** |
| Phụ lục | 8–15 |
| Tài liệu tham khảo | 3–5 |

---

## 1. Global registries (cross-reference)

### 1.1 Figure registry

| Figure ID | Title (Vietnamese) | Source modules | Creation method | Referenced in |
|-----------|-------------------|----------------|-----------------|---------------|
| **Hình 1.1** | Bối cảnh livestream thương mại và quá tải tương tác chat | — | Draw.io / Canva conceptual diagram | 1.1 |
| **Hình 1.2** | Quy trình nghiên cứu: Bài toán → Giải pháp → Kiến trúc → Triển khai → Đánh giá | All | Draw.io flowchart | 1.4 |
| **Hình 2.1** | Pipeline thị giác máy tính: AR trình duyệt, nhận diện khuôn mặt, cử chỉ | M1 Browser AR, M2 FR, M3 Gesture | Draw.io from `browser-ar/`, `face_recognition/`, `gesture_detection/` | 2.2 |
| **Hình 2.2** | Phân loại ý định lai: PhoBERT + luật + tín hiệu commerce | M6 Intent | Draw.io from `mlIntentBridge.ts` logic | 2.3, 3.6 |
| **Hình 2.3** | Khoảng trống nghiên cứu và định hướng hệ thống đề xuất | Platform | Draw.io gap diagram | 2.6 |
| **Hình 3.1** | Kiến trúc AS-IS hệ thống hỗ trợ bán hàng livestream (triển khai thực tế) | Platform | **Draw.io — mandatory**; modules from evidence P-03, IC-04, IC-05 | 3.2, 4.2, Pres.1 |
| **Hình 3.2** | Luồng trải nghiệm người xem trên demo chính | M1,M4,M6,M7,M8 | UML sequence (draw.io) from `DemoPage.tsx` | 3.3 |
| **Hình 3.3** | Pipeline Browser AR và ánh xạ sản phẩm → effect | M1, catalog | Draw.io from `BrowserArStream`, `mapArEffectTypeToBrowserAr` | 3.4 |
| **Hình 3.4** | Luồng sự kiện nhận diện khuôn mặt và cử chỉ | M2, M3 | Draw.io from registration + `interaction_events` | 3.5 |
| **Hình 3.5** | Pipeline AI Sales Assistant | M5,M6,M7 | Draw.io from `salesNlpPipeline.ts` | 3.6, 4.5 |
| **Hình 3.6** | Sơ đồ trạng thái giỏ hàng và checkout demo | M8 | State diagram from `useCommerceCart.ts` | 3.8 |
| **Hình 3.7** | Triển khai local/Docker Compose | Platform | Draw.io from `docker-compose.yml` | 3.9, 4.1 |
| **Hình 4.1** | Giao diện tổng thể demo livestream | Platform | **Screenshot** SCR-P01 | 4.2, 4.3 |
| **Hình 4.2** | Browser AR — effect kính trên luồng livestream | M1 | **Screenshot** SCR-AR01 | 4.3 |
| **Hình 4.3** | Đăng ký khuôn mặt qua trình duyệt | M2 | **Screenshot** SCR-FR01 | 4.4 |
| **Hình 4.4** | Panel chat trực tuyến | M7 | **Screenshot** SCR-CH01 | 4.5 |
| **Hình 4.5** | AI Sales Assistant — intent, ML badge, commerce actions | M6,M7,M8 | **Screenshot** SCR-SA01 | 4.5, 4.6 |
| **Hình 4.6** | Giỏ hàng livestream có sản phẩm | M8 | **Screenshot** SCR-CM01 | 4.6 |
| **Hình 4.7** | Modal checkout demo (COD) | M8 | **Screenshot** SCR-CM02 | 4.6 |
| **Hình 4.8** | Tóm tắt đơn hàng mock sau checkout | M8 | **Screenshot** SCR-CM03 | 4.6 |
| **Hình 4.9** | Badge PhoBERT trên tin nhắn viewer | M6 | **Screenshot** SCR-IC01 | 4.5, 4.7 |
| **Hình 4.10** | AI Event Feed — sự kiện cử chỉ | M3 | **Screenshot** SCR-GE01 | 4.3 |
| **Hình PL.1** | Sơ đồ cấu trúc phụ lục hướng dẫn chạy demo | docs/ | Flowchart | Phụ lục |

### 1.2 Table registry

| Table ID | Title | Data source | Metrics / values source | Code / dataset path |
|----------|-------|-------------|---------------------------|---------------------|
| **Bảng 1.1** | Mục tiêu nghiên cứu và tiêu chí đánh giá | Author + blueprint §0.1 | Qualitative criteria | Capability list in `DemoPage.tsx` |
| **Bảng 1.2** | Phạm vi: trong phạm vi / ngoài phạm vi | Evidence P-06, F-* | — | `docs/limitations.md` |
| **Bảng 2.1** | Taxonomy 11 intent chat commerce | ML taxonomy doc | Label definitions | `smart-livestream-ml/docs/intent_taxonomy_v1.md` |
| **Bảng 2.2** | So sánh nghiên cứu / hệ thống liên quan | Literature (author) | — | 8–12 papers (TBD) |
| **Bảng 2.3** | Ánh xạ intent ML → intent hệ thống PoC | Mapper code | — | `backend/app/services/ml_intent_mapper.py` |
| **Bảng 3.1** | Yêu cầu chức năng và phi chức năng | Use cases from demo | NFR: latency, explainability | `docs/AI_SALES_ASSISTANT.md` |
| **Bảng 3.2** | Thứ tự ưu tiên phân giải sản phẩm | Resolver design | — | `productMentionResolver.ts` |
| **Bảng 3.3** | Implemented vs Future Work | Blueprint §3.10 | — | `THESIS_EVIDENCE.md` section K |
| **Bảng 3.4** | API và kênh giao tiếp chính (AS-IS) | Backend routes | — | `backend/app/main.py`, `serve_intent_api.py` |
| **Bảng 4.1** | Môi trường phần cứng và phần mềm | Measured at demo time | Versions from package files | `requirements.txt`, `package.json` |
| **Bảng 4.2** | Kết quả phân loại intent: TF-IDF vs PhoBERT | Test split | **metrics.json** | `smart-livestream-ml/artifacts/phobert_base_combined/metrics.json`, `baseline_tfidf_logreg_combined/metrics.json` |
| **Bảng 4.3** | So sánh qualitative câu demo (base vs hardcases model) | Manual predict | `demo_predict_results.txt` | `smart-livestream-ml/artifacts/demo_predict_results.txt` |
| **Bảng 4.4** | Kịch bản kiểm thử Sales Assistant | Sales Lab script | resolutionSource, intent | `docs/checkout_demo.md`, `docs/AI_SALES_ASSISTANT.md` |
| **Bảng 4.5** | Hiệu năng Browser AR theo mode (FPS) | AR Lab benchmark | **EXP-06 output** | `frontend/src/poc/ar-lab/harness/arBenchmarkHarness.ts` |
| **Bảng 4.6** | Kiểm thử tự động | pytest + vitest logs | pass counts | `backend/tests/`, `frontend/src/features/commerce/*.test.ts` |
| **Bảng 4.7** | Dataset huấn luyện intent (các phiên bản) | Dataset line counts | split sizes | `smart-livestream-ml/data/generated/*.jsonl` |
| **Bảng 5.1** | Đối chiếu mục tiêu ban đầu và kết quả | Ch.1 vs Ch.4 | — | Blueprint crosswalk |
| **Bảng PL.1** | Tham số cấu hình PhoBERT | Training config | hyperparameters | `smart-livestream-ml/configs/phobert_base.yaml` |

### 1.3 Screenshot registry

| Screen ID | File name | Route | Expected UI state | Chapters |
|-----------|-----------|-------|-------------------|----------|
| SCR-P01 | `demo-main-overview.png` | `/` | Stream LIVE, AR active, chat + cart panels visible | 4.1, Phụ lục |
| SCR-P02 | `product-catalog-pinned.png` | `/` | Catalog expanded, one product pinned | 3.3, 4.2 |
| SCR-AR01 | `browser-ar-glasses.png` | `/` | Effect `glasses`, face landmarks optional debug off | 4.2 |
| SCR-AR02 | `ar-lab-benchmark.png` | `/poc/ar-lab` | Benchmark table after 30s run, mode glasses_ar | 4.9 |
| SCR-FR01 | `register-face-ui.png` | `/register-face` | Multi-pose capture step mid-session | 4.4 |
| SCR-GE01 | `ai-event-feed-gesture.png` | `/` | AI Event Feed showing Raise Hand | 4.3 |
| SCR-CH01 | `chat-panel-reply.png` | `/` | Viewer question + AI assistant reply | 4.4, 4.5 |
| SCR-IC01 | `ml-intent-badge.png` | `/` or `/poc/sales-lab` | PhoBERT badge on viewer message | 4.5, 4.7 |
| SCR-SA01 | `sales-assistant-events.png` | `/` | SalesAssistantPanel with commerce action buttons | 4.5 |
| SCR-SL01 | `sales-lab-chat.png` | `/poc/sales-lab` | Simulated chat + assistant reply | 4.5, 4.8 |
| SCR-CM01 | `cart-with-item.png` | `/` | Cart: 1 item, subtotal > 0 | 4.6 |
| SCR-CM02 | `checkout-modal-cod.png` | `/` | Checkout modal open, COD selected | 4.6 |
| SCR-CM03 | `order-summary-cod.png` | `/` | Order summary cod_confirmed | 4.6 |
| SCR-CM04 | `order-summary-qr-paid.png` | `/` | Order summary paid after mock QR | 4.6 |
| SCR-DK01 | `docker-compose-running.png` | terminal + `/` | compose up + health OK | 4.1, 3.9 |
| SCR-HL01 | `api-health-json.png` | browser | `GET /api/health` JSON | 3.9, Phụ lục |

### 1.4 Experiment registry

| Exp ID | Objective | Commands / procedure | Expected output | Chapter |
|--------|-----------|----------------------|-----------------|---------|
| **EXP-01** | Verify platform startup | See `docs/demo-script.md` | UI loads, no console errors | 4.1, 4.2 |
| **EXP-02** | Backend health | `curl http://127.0.0.1:8000/api/health` | `{"status":"ok"}` | 4.1 |
| **EXP-03** | Chat multi-tab sync | Two tabs `/`, send message | Both tabs show message | 4.5 |
| **EXP-04** | Sales Lab intent scenarios | `/poc/sales-lab` + Bảng 4.4 rows | Events with correct intent | 4.8 |
| **EXP-05** | PhoBERT demo phrases | ML API + `predict_intent.py` on 10 phrases | Top intent + confidence log | 4.7 |
| **EXP-06** | AR FPS benchmark | `/poc/ar-lab` → benchmark 30s × 3 modes | FPS avg/min in Bảng 4.5 | 4.9 |
| **EXP-07** | Backend automated tests | `cd backend && pytest -q` | All tests pass | 4.10 |
| **EXP-08** | Frontend commerce tests | `cd frontend && npm test` | 10 tests pass | 4.10 |
| **EXP-09** | E2E checkout script | `docs/checkout_demo.md` 5 steps | Order ID `LS-*` | 4.6 |
| **EXP-10** | Docker Compose | `docker compose up` per `docs/DOCKER.md` | Services reachable | 4.1 |
| **EXP-11** | Export ML metrics (read-only) | Read artifact JSON files | Numbers for Bảng 4.2 | 4.7 |
| **EXP-12** | ML bridge offline fallback | Stop port 8010, send chat | rules_fallback badge | 4.7 |
| **EXP-13** | Gesture → AI Event Feed | `GET /video-feed` or inference path + raise hand | Event in feed | 4.3 |
| **EXP-14** | Production build | `cd frontend && npm run build` | Build success | 4.1 |

### 1.5 Reference registry (minimum targets — author fills citations)

| Ref block | Chapter | Min. count | Topics |
|-----------|---------|------------|--------|
| REF-1.x | Ch.1 | 3–5 | Livestream commerce, digital selling, Vietnam e-commerce |
| REF-2.x | Ch.2 | 12–18 | CV (face, pose, AR), NLP intent, PhoBERT/BERT, live chatbots |
| REF-3.x | Ch.3 | 4–6 | FastAPI, WebSocket, MediaPipe, InsightFace, system design |
| REF-4.x | Ch.4 | 2–4 | Reproducibility, evaluation methodology |
| REF-5.x | Ch.5 | 0–2 | Future trends (optional) |

**Fixed technical references (must cite):**

| ID | Source |
|----|--------|
| REF-T01 | VinAI PhoBERT (`vinai/phobert-base`) |
| REF-T02 | MediaPipe Face Landmarker / Hands |
| REF-T03 | InsightFace |
| REF-T04 | FastAPI documentation |
| REF-T05 | React / Vite (UI stack) |

---

## 2. CHƯƠNG 1 — GIỚI THIỆU (10–12 trang)

### 2.1 Chapter objectives

1. Establish livestream sales overload problem and urgency.  
2. State thesis goal: **smart sales support system** using AI + CV — not “PhoBERT thesis”.  
3. Define scope, method, thesis structure.  
4. Align with CDUDCNTT template sections 1.1–1.5.

### 2.2 Sections and subsections

| Section | Subsections | Pages | Content to write |
|---------|-------------|------:|------------------|
| **1.1. Đặt vấn đề** | 1.1.1 Bối cảnh thực tiễn livestream thương mại · 1.1.2 Áp lực phản hồi chat và chốt đơn · 1.1.3 Hạn chế giải pháp rời rạc | 3–4 | Problem narrative; cite REF-1.x |
| **1.2. Mục tiêu nghiên cứu và phát triển hệ thống** | 1.2.1 Mục tiêu tổng quát · 1.2.2 Mục tiêu cụ thể (8 capabilities) · 1.2.3 Tiêu chí đánh giá thành công | 2–3 | Bảng 1.1 |
| **1.3. Phạm vi nghiên cứu** | 1.3.1 Đối tượng · 1.3.2 Dữ liệu (catalog demo + ML dataset) · 1.3.3 Phạm vi triển khai (browser/local/Docker) | 2 | Bảng 1.2; evidence IC-03 |
| **1.4. Phương pháp thực hiện** | 1.4.1 Phương pháp nghiên cứu ứng dụng · 1.4.2 Quy trình Problem→Evaluation · 1.4.3 Công cụ và môi trường (high level) | 2 | Hình 1.2 |
| **1.5. Cấu trúc tiểu luận** | — | 1 | Map 5 chapters |

### 2.3 Chapter assets

| Type | IDs |
|------|-----|
| Figures | Hình 1.1, Hình 1.2 |
| Tables | Bảng 1.1, Bảng 1.2 |
| Screenshots | None required |
| Experiments | None (design chapter) |
| Evidence | P-06, IC-03, CM-07 |
| Code modules | Conceptual only — cite `DemoPage.tsx` as integration point |
| Datasets | Mention: 10 product catalog; ML combined 4,404 (footnote synthetic-heavy) |
| Metrics | None in Ch.1 |
| Appendix | — |

---

## 3. CHƯƠNG 2 — CƠ SỞ LÝ THUYẾT VÀ NGHIÊN CỨU LIÊN QUAN (16–20 trang)

### 3.1 Chapter objectives

1. Provide theoretical foundation for CV + NLP in livestream sales.  
2. Position PhoBERT as **one technique** within intent module.  
3. Survey related work; define research gap for **integrated system**.  
4. Avoid repository-based structure.

### 3.2 Sections and subsections

| Section | Subsections | Pages |
|---------|-------------|------:|
| **2.1. Livestream thương mại và chat người xem** | 2.1.1 Mô hình tương tác · 2.1.2 Loại câu hỏi mua hàng · 2.1.3 Vai trò host và automation | 3–4 |
| **2.2. Thị giác máy tính trong trải nghiệm livestream** | 2.2.1 AR thử sản phẩm trên trình duyệt · 2.2.2 Nhận diện khuôn mặt (embedding) · 2.2.3 Nhận diện cử chỉ tay | 4–5 |
| **2.3. Trí tuệ nhân tạo cho phân loại ý định** | 2.3.1 Taxonomy intent · 2.3.2 Rule-based vs neural · 2.3.3 PhoBERT tiếng Việt · 2.3.4 Chiến lược lai ML + luật | 4–5 |
| **2.4. Trợ lý bán hàng và phân giải sản phẩm** | 2.4.1 Retrieval catalog · 2.4.2 Template reply và escalation | 2–3 |
| **2.5. Nghiên cứu và hệ thống liên quan** | 2.5.1 Tổng quan · 2.5.2 So sánh | 3–4 |
| **2.6. Khoảng trống và định hướng đề xuất** | — | 2 | Hình 2.3 |

### 3.3 Chapter assets

| Type | IDs |
|------|-----|
| Figures | Hình 2.1, 2.2, 2.3 |
| Tables | Bảng 2.1, 2.2, 2.3 |
| Screenshots | None |
| Experiments | EXP-11 (read taxonomy/metrics files for accuracy in footnotes) |
| Evidence | IC-01–IC-03, PR-03, AR-05, REF-T01–T03 |
| Code modules | M1–M8 (conceptual mapping only) |
| Datasets | `livestream_intent_combined.jsonl` (4,404); v2 real count 8 |
| Metrics | Quote in footnote only: F1 0.9726 synthetic-heavy |
| References | REF-2.x (12–18), REF-T01–T05 |
| Appendix | — |

---

## 4. CHƯƠNG 3 — PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG (22–26 trang)

### 4.1 Chapter objectives

1. Specify functional/non-functional requirements for livestream sales support.  
2. Present **AS-IS architecture only** (Hình 3.1).  
3. Design each capability module and data flows.  
4. Isolate **Future Work** in §3.10.

### 4.2 Sections and subsections

| Section | Subsections | Pages |
|---------|-------------|------:|
| **3.1. Phân tích yêu cầu** | 3.1.1 Actor (viewer, host, AI) · 3.1.2 FR · 3.1.3 NFR | 3–4 |
| **3.2. Kiến trúc tổng thể (Implemented)** | 3.2.1 Thành phần · 3.2.2 Giao tiếp · 3.2.3 Ràng buộc triển khai | 4–5 |
| **3.3. Thiết kế luồng trải nghiệm livestream** | 3.3.1 Demo chính · 3.3.2 Sales Lab | 2–3 |
| **3.4. Thiết kế Browser AR** | 3.4.1 Engine · 3.4.2 Effect · 3.4.3 Product mapping | 2–3 |
| **3.5. Thiết kế nhận diện khuôn mặt và cử chỉ** | 3.5.1 Registration · 3.5.2 Inference paths · 3.5.3 Event feed | 3 |
| **3.6. Thiết kế AI Sales Assistant** | 3.6.1 Pipeline · 3.6.2 Intent bridge · 3.6.3 Actions | 4–5 |
| **3.7. Thiết kế phân giải sản phẩm** | 3.7.1 TF-IDF · 3.7.2 Priority rules | 2 |
| **3.8. Thiết kế thương mại demo** | 3.8.1 Cart · 3.8.2 Checkout · 3.8.3 Order state | 2–3 |
| **3.9. Triển khai và vận hành** | 3.9.1 Local · 3.9.2 Docker | 2 |
| **3.10. Hướng phát triển (Future Work)** | Explicit list F-01–F-08 | 2 | Bảng 3.3 |

### 4.3 Chapter assets

| Type | IDs |
|------|-----|
| Figures | Hình 3.1–3.7 (all draw.io except none screenshot) |
| Tables | Bảng 3.1–3.4 |
| Screenshots | SCR-P02 optional in draft review |
| Experiments | Code review only |
| Evidence | All sections A–I design claims; F-* for §3.10 only |
| Code modules | Full paths in THESIS_EVIDENCE |
| Datasets | Catalog `products.ts`; intent combined split paths |
| Metrics | — |
| Appendix | — |
| **Presentation 1** | Export §3.1–3.9 slides + Hình 3.1, 3.5, 3.6 |

---

## 5. CHƯƠNG 4 — XÂY DỰNG VÀ ĐÁNH GIÁ HỆ THỐNG (24–28 trang)

### 5.1 Chapter objectives

1. Document implementation by **capability**, not folder.  
2. Present demo evidence (screenshots + experiments).  
3. Evaluate intent module with **real metrics** + limitations.  
4. Evaluate AR, assistant scenarios, automated tests.

### 5.2 Sections and subsections

| Section | Subsections | Pages |
|---------|-------------|------:|
| **4.1. Môi trường thực nghiệm** | HW/SW/network | 2 | Bảng 4.1 |
| **4.2. Triển khai nền tảng tích hợp** | Startup, routes, integration | 2–3 | Hình 4.1 |
| **4.3. Triển khai AR và sự kiện AI** | Browser AR + gesture feed | 3 | Hình 4.2, 4.10 |
| **4.4. Triển khai nhận diện khuôn mặt** | Web registration | 2 | Hình 4.3 |
| **4.5. Triển khai chat và AI Sales Assistant** | WS chat, hybrid intent, panel | 4 | Hình 4.4, 4.5, 4.9 |
| **4.6. Triển khai thương mại demo** | Cart/checkout E2E | 3–4 | Hình 4.6–4.8 |
| **4.7. Đánh giá phân loại ý định (PhoBERT module)** | Baseline, PhoBERT, hardcases, footnote | 3–4 | Bảng 4.2, 4.3, 4.7 |
| **4.8. Đánh giá Sales Assistant và phân giải sản phẩm** | Scenario tests | 2–3 | Bảng 4.4 |
| **4.9. Đánh giá Browser AR** | FPS benchmark | 2 | Bảng 4.5, SCR-AR02 |
| **4.10. Kiểm thử tự động** | pytest, vitest | 2 | Bảng 4.6 |
| **4.11. Đánh giá tổng thể** | Strengths, limits vs Bảng 1.1 | 2–3 | Bảng 5.1 preview |

### 5.3 Chapter assets

| Type | IDs |
|------|-----|
| Figures | Hình 4.1–4.10 (screenshots) |
| Tables | Bảng 4.1–4.7 |
| Screenshots | All SCR-* marked for Ch.4 |
| Experiments | EXP-01–EXP-14 |
| Evidence | Full inventory A–J |
| Code modules | Per capability tables in EVIDENCE |
| Datasets | Bảng 4.7 |
| Metrics | Bảng 4.2, 4.5 |
| Appendix | Link EXP commands |
| **Presentation 2** | Demo video + Hình 4.1, 4.5, 4.6 + Bảng 4.2 |

---

## 6. CHƯƠNG 5 — KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN (6–8 trang)

### 6.1 Sections

| Section | Pages | Content |
|---------|------:|---------|
| **5.1. Kết quả đạt được** | 2 | 8 capabilities delivered |
| **5.2. Đóng góp** | 1–2 | Integrated smart livestream **sales support** system |
| **5.3. Hạn chế** | 2 | IC-03, P-05, AR-05, no DB/auth/payment |
| **5.4. Hướng phát triển** | 1–2 | F-01–F-08 from evidence |

### 6.2 Assets

| Type | IDs |
|------|-----|
| Tables | Bảng 5.1 |
| Evidence | F-*, IC-03, P-05 |
| References | REF-5.x optional |

---

## 7. PHỤ LỤC

| Appendix | Content | Evidence / files |
|----------|---------|------------------|
| **Phụ lục A** | Link mã nguồn GitHub (PoC + ML) | Author URLs |
| **Phụ lục B** | Hướng dẫn cài đặt và chạy demo | `docs/demo-script.md`, `docs/phobert_bridge_demo.md`, `docs/checkout_demo.md` |
| **Phụ lục C** | Ảnh giao diện bổ sung | All SCR-* |
| **Phụ lục D** | Cấu hình huấn luyện PhoBERT | Bảng PL.1, `configs/phobert_base.yaml` |
| **Phụ lục E** | Kết quả kiểm thử đầy đủ (log pytest/vitest) | EXP-07, EXP-08 outputs |

---

## 8. Presentation mapping

### 8.1 Presentation 1 (04/07/2026) — 30–35 slides

| Slide block | Blueprint source | Required assets |
|-------------|------------------|-----------------|
| Intro + title | Official title | — |
| Problem 1.1 | Ch.1 | Hình 1.1 |
| Objectives 1.2 | Bảng 1.1 | 8 capabilities |
| Scope 1.3 | Bảng 1.2 | |
| Related + gap 2.5–2.6 | Hình 2.3 | |
| Requirements 3.1 | Bảng 3.1 | |
| **Architecture 3.2** | **Hình 3.1** | AS-IS only |
| Module designs 3.4–3.8 | Hình 3.5, 3.6 | |
| Tech stack | REF-T02–T05 | Bảng 3.4 |
| Future 3.10 | Bảng 3.3 | One slide only |
| Plan + risks | Ch.1.4 | Hình 1.2 |
| **Deliverable** | Đề cương Ch.1–3 | DOCX draft |

### 8.2 Presentation 2 (25/07/2026)

| Slide block | Blueprint source | Required assets |
|-------------|------------------|-----------------|
| Recap | Title + Bảng 5.1 | |
| Live demo | EXP-01, EXP-09 | Video |
| Implemented features | Ch.4 §4.3–4.6 | SCR-* |
| AI metrics | Bảng 4.2–4.3 | EXP-11, EXP-05 |
| AR metrics | Bảng 4.5 | EXP-06 |
| Tests | Bảng 4.6 | EXP-07, EXP-08 |
| Limits + future | Ch.5 | |
| GitHub + appendix | Phụ lục A | |

---

## 9. Subsystem → code map (browser-first)

| Subsystem | Capability | Primary paths |
|-----------|------------|---------------|
| **CV — Browser AR** | M1 | `frontend/src/features/browser-ar/` |
| **CV — Face** | M2 | `face_recognition/`, `api/face_registration.py`, `RegisterFacePage.tsx` |
| **CV — Gesture** | M3 | `gesture_detection/`, `stream_inference.py`, `interaction_events.py`, `AiEventFeedPanel.tsx` |
| **NLU — Intent** | M6 | `smart-livestream-ml/`; PoC: `nlp.py`, `mlIntentBridge.ts` |
| **NLU — Product resolution** | M5 | `product-search/`, `productMentionResolver.ts`, `product-catalog/` |
| **Sales Assistant** | M7 | `sales-nlp/`, `sales-assistant/`, `ChatPanel.tsx`, `SalesAssistantPanel.tsx` |
| **Commerce** | M8 | `frontend/src/features/commerce/` |
| **Platform** | Chat M4 + integration | `api/chat.py`, `DemoPage.tsx`, `docker-compose.yml` |

---

## 10. Dataset index

| Dataset ID | File | Records | Use in thesis |
|------------|------|--------:|---------------|
| DS-CAT | `frontend/.../products.ts` | 10 products | Ch.1.3, 3.7, 4.8 |
| DS-V2 | `livestream_intent_v2.jsonl` | 1,108 | Ch.2.3 footnote |
| DS-COMB | `livestream_intent_combined.jsonl` | 4,404 | Bảng 4.7, 4.7 |
| DS-SPLIT | `data/processed/combined/{train,dev,test}.jsonl` | 3082/661/661 | Bảng 4.7, 4.2 |
| DS-HARD | `combined_hardcases` | 5,053 | Bảng 4.3 |
| DS-REAL | v2 real TikTok | **8** | Limitations Ch.4.7, 5.3 |

---

## 11. Metrics index (allowed numbers in thesis)

| Metric ID | Value | Source file |
|-----------|-------|-------------|
| MET-PHO-F1 | 0.9726 test macro F1 | `artifacts/phobert_base_combined/metrics.json` |
| MET-PHO-ACC | 0.9728 test accuracy | same |
| MET-TFIDF-F1 | 0.9818 test macro F1 | `artifacts/baseline_tfidf_logreg_combined/metrics.json` |
| MET-HARD-F1 | 0.9592 test macro F1 | `artifacts/phobert_base_combined_hardcases/metrics.json` |
| MET-REAL-N | 8 | ML README / v2 metadata |
| MET-TEST-VITEST | 10 passed | `npm test` |
| MET-FPS-* | TBD | EXP-06 → Bảng 4.5 |

**Mandatory sentence** wherever MET-PHO-* or MET-TFIDF-* appear:  
*“Dataset đánh giá thiên về synthetic; chỉ gồm 8 comment tiếng Việt thật — metrics không đại diện cho chat livestream production.”*

---

## 12. Approval gate before DOCX writing

- [ ] All figures Hình 3.1–3.7 drafted (draw.io)
- [ ] P0 screenshots captured (BUILD_PLAN Phase 1)
- [ ] EXP-06 AR benchmark complete
- [ ] REF-2.x literature list started (min 12)
- [ ] Author info for template cover (name, MSHV, khóa)

**Do not open Biểu mẫu for body text until BUILD_PLAN Phase 2 checklist signed off.**
