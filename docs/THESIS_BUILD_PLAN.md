# THESIS BUILD PLAN — Master Checklist

**Official title:**  
**Xây dựng hệ thống hỗ trợ bán hàng thông minh cho livestream ứng dụng trí tuệ nhân tạo và thị giác máy tính**

**Companion documents:**

| Document | Role |
|----------|------|
| [`THESIS_BLUEPRINT.md`](THESIS_BLUEPRINT.md) | What to write (sections, figures, tables) |
| [`THESIS_EVIDENCE.md`](THESIS_EVIDENCE.md) | Proof inventory — gate every claim |
| [`THESIS_OUTLINE.md`](THESIS_OUTLINE.md) | Short outline + presentation map |
| `Document/4. Biểu mẫu Tiểu luận - Đồ án.docx` | Final output (not started) |

**Rule:** Do not write thesis body in DOCX until **Phase 2** is complete.  
**Rule:** Do not claim anything in thesis unless matching evidence row is ✅.

---

## Progress summary

| Phase | Name | Status |
|-------|------|--------|
| 0 | Blueprint & evidence design | ✅ Complete |
| 1 | Assets & experiments | ⬜ Not started |
| 2 | Diagrams & screenshot gate | ⬜ Not started |
| 3 | Write Ch.1 → Ch.3 (Presentation 1) | ⬜ Blocked on Phase 2 |
| 4 | Write Ch.4 → Ch.5 + appendix | ⬜ Blocked on Phase 1 |
| 5 | Presentation 2 + video + final DOCX polish | ⬜ Blocked |
| 6 | Submit 15/08/2026 | ⬜ |

---

## Phase 0 — Blueprint (DONE)

- [x] Official title locked
- [x] `THESIS_BLUEPRINT.md` created
- [x] `THESIS_EVIDENCE.md` expanded
- [x] `THESIS_BUILD_PLAN.md` created
- [x] Implementation-driven chapter structure approved

---

## Phase 1 — Assets & experiments (do first)

**Goal:** Convert all 🔴 evidence to ✅ before writing Ch.4 or drawing final figures.

### 1.1 Environment setup

- [ ] Create folders: `docs/thesis-screenshots/`, `docs/thesis-figures/`
- [ ] Record machine spec for **Bảng 4.1** (CPU, RAM, OS, browser, Python, Node versions)
- [ ] **EXP-01** — Start backend + frontend; confirm `/` loads
- [ ] **EXP-02** — `curl http://127.0.0.1:8000/api/health` → capture **SCR-HL01**
- [ ] **EXP-10** — Optional Docker Compose; capture **SCR-DK01**
- [ ] **EXP-14** — `npm run build` — log for Bảng 4.1

### 1.2 ML intent service (Module 6)

- [ ] Start ML API: `serve_intent_api.py` port 8010 (see `docs/phobert_bridge_demo.md`)
- [ ] **EXP-11** — Export numbers for **Bảng 4.2** from `metrics.json` (read-only)
- [ ] **EXP-05** — Run 10 demo phrases; fill **Bảng 4.3**
- [ ] **EXP-12** — Stop ML service; verify rules fallback → **SCR-IC01** variant

### 1.3 Automated tests

- [ ] **EXP-07** — `cd backend && pytest -q` → save log for **Phụ lục E**
- [ ] **EXP-08** — `cd frontend && npm test` → save log for **Bảng 4.6**

### 1.4 AR benchmark (Module 1)

- [ ] **EXP-06** — `/poc/ar-lab` benchmark 30s × modes: `raw_camera`, `glasses_ar`, `full_filter`
- [ ] Record FPS avg/min → **Bảng 4.5**
- [ ] Capture **SCR-AR02**

### 1.5 Screenshot capture session (P0)

| Done | Screen ID | File |
|------|-----------|------|
| ⬜ | SCR-P01 | `demo-main-overview.png` |
| ⬜ | SCR-P02 | `product-catalog-pinned.png` |
| ⬜ | SCR-AR01 | `browser-ar-glasses.png` |
| ⬜ | SCR-FR01 | `register-face-ui.png` |
| ⬜ | SCR-CH01 | `chat-panel-reply.png` |
| ⬜ | SCR-IC01 | `ml-intent-badge.png` |
| ⬜ | SCR-SA01 | `sales-assistant-events.png` |
| ⬜ | SCR-CM01 | `cart-with-item.png` |
| ⬜ | SCR-CM02 | `checkout-modal-cod.png` |
| ⬜ | SCR-CM03 | `order-summary-cod.png` |
| ⬜ | SCR-CM04 | `order-summary-qr-paid.png` |

### 1.6 E2E scenarios

- [ ] **EXP-03** — Two-tab chat sync
- [ ] **EXP-04** — Run all rows in **Bảng 4.4** on Sales Lab
- [ ] **EXP-09** — Follow `docs/checkout_demo.md` (5 steps); optional 5 PNG sequence
- [ ] **EXP-13** — Gesture via backend inference/`/video-feed` → **SCR-GE01**

### 1.7 Update evidence file

- [ ] Set all completed rows to ✅ in `THESIS_EVIDENCE.md`
- [ ] Fill MET-FPS-* in metrics index

**Phase 1 exit criteria:** All P0 screenshots ✅; Bảng 4.2, 4.5, 4.6 data ready; EXP-07/08 logs saved.

---

## Phase 2 — Diagrams (before DOCX Ch.1–3)

**Goal:** All design figures ready for Presentation 1 and Ch.3.

### 2.1 Draw.io exports → `docs/thesis-figures/`

| Done | Figure ID | Priority |
|------|-----------|----------|
| ⬜ | **Hình 3.1** | P0 — AS-IS architecture |
| ⬜ | Hình 1.1 | P1 |
| ⬜ | Hình 1.2 | P1 |
| ⬜ | Hình 2.1 | P1 |
| ⬜ | Hình 2.2 | P1 |
| ⬜ | Hình 2.3 | P1 |
| ⬜ | Hình 3.2 | P1 |
| ⬜ | Hình 3.3 | P2 |
| ⬜ | Hình 3.4 | P2 |
| ⬜ | **Hình 3.5** | P0 — Sales pipeline |
| ⬜ | Hình 3.6 | P1 |
| ⬜ | Hình 3.7 | P2 |

### 2.2 Diagram review checklist (Hình 3.1)

- [ ] Shows: Browser app, Platform API, Intent service :8010, embedding storage
- [ ] Does **not** show: PostgreSQL, OAuth, payment gateway, K8s
- [ ] Labels match **Bảng 3.4** API list
- [ ] Marked caption: *Kiến trúc triển khai thực tế (AS-IS)*

**Phase 2 exit criteria:** Hình 3.1 + 3.5 exported; figure registry in BLUEPRINT matches files on disk.

---

## Phase 3 — Write thesis: Ch.1–3 + Presentation 1 (deadline 04/07/2026)

**Prerequisite:** Phase 2 complete (diagrams). Phase 1 partial OK for Ch.1–2.

### 3.1 Template front matter

- [ ] Copy formatting from `Biểu mẫu Tiểu luận - Đồ án.docx`
- [ ] Fill cover: **official title**, author, MSHV, khóa, GV HD: TS. Cao Văn Kiên
- [ ] Lời cảm ơn, mục lục skeleton, danh mục hình/bảng placeholders

### 3.2 Chapter writing order

| Done | Chapter | Pages | Blueprint § | Key assets |
|------|---------|------:|-------------|------------|
| ⬜ | **Ch.1** | 10–12 | BLUEPRINT §2 | Hình 1.1–1.2, Bảng 1.1–1.2 |
| ⬜ | **Ch.2** | 16–20 | BLUEPRINT §3 | Hình 2.1–2.3, Bảng 2.1–2.3, REF-2.x |
| ⬜ | **Ch.3** | 22–26 | BLUEPRINT §4 | Hình 3.1–3.7, Bảng 3.1–3.4 |

### 3.3 Per-section gate (use before marking section done)

For each subsection written:

1. [ ] Every technical claim has evidence ID in `THESIS_EVIDENCE.md`
2. [ ] Figure/table numbers match BLUEPRINT registry
3. [ ] No Future Work language outside §3.10
4. [ ] PhoBERT framed as module inside M6, not thesis title claim
5. [ ] Metrics include synthetic-heavy footnote if cited

### 3.4 Presentation 1 deliverables

- [ ] Slide deck 30–35 (see BLUEPRINT §8.1)
- [ ] Upload to Drive by **04/07/2026**
- [ ] Đề cương DOCX: Ch.1 + Ch.2 + dự thảo Ch.3

**Phase 3 exit criteria:** DOCX draft through §3.10; slides uploaded; advisor feedback captured for Phase 5 revisions.

---

## Phase 4 — Write thesis: Ch.4–5 + appendix

**Prerequisite:** Phase 1 complete (all screenshots + experiments).

| Done | Chapter | Pages | Key assets |
|------|---------|------:|------------|
| ⬜ | **Ch.4** | 24–28 | Hình 4.1–4.10, Bảng 4.1–4.7, all SCR-* |
| ⬜ | **Ch.5** | 6–8 | Bảng 5.1 |
| ⬜ | **Phụ lục A–E** | 8–15 | GitHub links, run guides, logs |
| ⬜ | **Tài liệu tham khảo** | 3–5 | REF-* complete, APA/IEEE per template |

---

## Phase 5 — Presentation 2 + video (deadline 25/07/2026)

- [ ] Record **video demo** (5–10 min): AR → chat → intent → cart → checkout
- [ ] Slide deck 30–35 (BLUEPRINT §8.2)
- [ ] Live demo rehearsal (EXP-01 + EXP-09)
- [ ] Upload slides + video to Drive
- [ ] Incorporate Presentation 1 feedback into Ch.3/Ch.4

---

## Phase 6 — Final submission (deadline 15/08/2026)

- [ ] Full proofread (structure rubric 1.5/10, formatting 1.5/10)
- [ ] Danh mục hình/bảng page numbers correct
- [ ] All figures have captions **below** (hình) / **above** (bảng) per template
- [ ] Phiếu chấm / rubric self-check against course template
- [ ] Email bản mềm to cvkien@ntt.edu.vn
- [ ] Final commit / GitHub tag for reproducibility (Phụ lục A)

---

## Quick reference: document → chapter

| Write in chapter | Read from |
|------------------|-----------|
| Section objectives | `THESIS_BLUEPRINT.md` §2–6 |
| Claim allowed? | `THESIS_EVIDENCE.md` row + ✅ |
| Figure title & ID | BLUEPRINT §1.1 |
| Table data | BLUEPRINT §1.2 + metrics index §11 |
| Screenshot spec | BLUEPRINT §1.3 |
| Run experiment | BLUEPRINT §1.4 |
| Code path | BLUEPRINT §9 + EVIDENCE module index |
| Dataset size | BLUEPRINT §10 |
| Do not claim | EVIDENCE section K (Future Work) |

---

## Risk register

| Risk | Mitigation | Owner step |
|------|------------|------------|
| ML API not running during demo | Document fallback in Ch.4.7; EXP-12 | Phase 1.2 |
| AR FPS too low | Report honestly in Bảng 4.5; NFR in 4.11 | EXP-06 |
| Synthetic metrics challenged | Mandatory footnote MET-* | All chapters |
| Missing literature | Start REF-2.x early (12 papers) | Phase 3 before Ch.2 |
| Scope creep (DB, auth) | Bảng 1.2 + §3.10 only | All writers |

---

## Revision log

| Date | Note |
|------|------|
| 2026-06-18 | Initial BUILD_PLAN; title officialized |

**Next action:** Begin **Phase 1.1** — create screenshot folders and run EXP-01/02.
