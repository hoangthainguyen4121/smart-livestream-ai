# Thesis Outline — Implementation-Driven (Summary)

**Official title:**  
**Xây dựng hệ thống hỗ trợ bán hàng thông minh cho livestream ứng dụng trí tuệ nhân tạo và thị giác máy tính**

**Full blueprint:** [`THESIS_BLUEPRINT.md`](THESIS_BLUEPRINT.md)  
**Evidence inventory:** [`THESIS_EVIDENCE.md`](THESIS_EVIDENCE.md)  
**Build checklist:** [`THESIS_BUILD_PLAN.md`](THESIS_BUILD_PLAN.md)  
**Word template:** `Document/4. Biểu mẫu Tiểu luận - Đồ án.docx`

**Organizing principle:** Problem → Solution → Architecture → Implementation → Evaluation  

**Architecture (browser-first):** React frontend → FastAPI backend → PhoBERT service → Sales Assistant → Commerce  

**Not in scope:** desktop client, native OpenCV window, `POST /api/desktop/events`.

---

## Core contribution

**Smart livestream sales support system** integrating eight capabilities:

1. Browser AR · 2. Face recognition · 3. Gesture recognition · 4. PhoBERT intent *(module M6)* · 5. Product resolution · 6. AI Sales Assistant · 7. Live chat · 8. Mock commerce

PhoBERT alone is **not** the thesis contribution.

---

## Chapter summary (see BLUEPRINT for full detail)

| Ch. | Title | Pages | Focus |
|-----|-------|------:|-------|
| 1 | Giới thiệu | 10–12 | Problem, goals, scope, method |
| 2 | Cơ sở lý thuyết | 16–20 | CV + NLP + gap → integrated system |
| 3 | Phân tích & thiết kế | 22–26 | AS-IS architecture; §3.10 Future only |
| 4 | Xây dựng & đánh giá | 24–28 | By capability + metrics + screenshots |
| 5 | Kết luận | 6–8 | Results, contribution, limits, future |

---

## Presentation mapping

| Event | Date | Deliverable | Blueprint § |
|-------|------|-------------|-------------|
| **Presentation 1** | 04/07/2026 | Slides + đề cương Ch.1–3 | §8.1 |
| **Presentation 2** | 25/07/2026 | Slides + video + GitHub | §8.2 |
| **Tiểu luận** | 15/08/2026 | Full DOCX | Phases 3–6 BUILD_PLAN |

---

## Diagram policy

| Label | Meaning |
|-------|---------|
| **Implemented (AS-IS)** | Evidence ✅ in `THESIS_EVIDENCE.md` |
| **Future Work** | §3.10 + evidence section K only |

---

## Next step

Execute **THESIS_BUILD_PLAN Phase 1** (screenshots + experiments).  
**Do not write DOCX** until Phase 2 diagram gate passed.
