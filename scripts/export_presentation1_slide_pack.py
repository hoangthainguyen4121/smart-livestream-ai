# -*- coding: utf-8 -*-
"""Export PRESENTATION1_MASTER_SLIDE_PACK.md from slide data."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from presentation1_slide_data import FIGURE_MAP, SLIDES, TOTAL_MINUTES

OUT = Path(__file__).resolve().parents[1] / "docs" / "PRESENTATION1_MASTER_SLIDE_PACK.md"


def main():
    lines = [
        "# Presentation 1 — Master Slide Pack",
        "",
        "**Thời lượng trình bày (S1–S24):** ~{:.0f} phút · **Q&A (S25):** 10 phút".format(TOTAL_MINUTES),
        "",
        "Nguồn: Ch.1–3 (khóa) · Figure Freeze v2.0 · Literature Freeze v1.0 · PRESENTATION_ARCHITECTURE_V2",
        "",
        "---",
        "",
        "## 1. Slide Outline",
        "",
        "| S# | Ch | Mục | Tiêu đề | TL | Hình |",
        "|----|----|-----|---------|-----|------|",
    ]
    for s in SLIDES:
        fig = s.get("image") or "—"
        if fig != "—":
            fig = fig.replace("hinh_", "H. ").replace("_", " ")[:20] + "…"
        lines.append(
            f"| {s['id']} | {s['chapter']} | {s['section']} | {s['title']} | {s['minutes']:.1f}m | {fig} |"
        )

    lines.extend(["", "---", "", "## 2–3. Nội dung từng slide & Speaker Notes", ""])

    for s in SLIDES:
        lines.extend([
            f"### {s['id']}. {s['title']}",
            "",
            f"**Objective:** {s['objective']}",
            "",
            "**Key messages:**",
        ])
        for b in s["bullets"]:
            lines.append(f"- {b}")
        lines.extend([
            "",
            f"**Visual:** {s['visual']}",
            "",
            "**Speaker notes (~90–120s):**",
            "",
            s["notes"],
            "",
            f"**Transition:** {s['transition']}",
            "",
            "---",
            "",
        ])

    lines.extend([
        "## 4. Danh sách hình cần chèn",
        "",
        "| Slide | File PNG | Hình luận văn |",
        "|-------|----------|---------------|",
    ])
    for sid, fname, label in FIGURE_MAP:
        lines.append(f"| {sid} | `docs/thesis-figures/{fname}` | {label} |")

    lines.extend([
        "",
        "Bảng trên slide: S4 (Bảng 1.1 rút), S11 (Bảng 2.2), S14 (Bảng 3.1), S18 (Bảng 3.2), S22 (Bảng 3.4).",
        "",
        "---",
        "",
        "## 5. Checklist rehearsal",
        "",
        "### Trước buổi bảo vệ",
        "- [ ] Điền họ tên, GVHD, ngày slide S1",
        "- [ ] Mở PPTX kiểm tra layout từng slide (chữ không tràn)",
        "- [ ] Rehearsal full 23–25 phút (bấm giờ từng khối Ch.1 / Ch.2 / Ch.3)",
        "- [ ] Thuộc 2 slide then chốt: S15 (kiến trúc), S19 (trợ lý)",
        "- [ ] Chuẩn bị trả lời: tách pipeline ý định/sản phẩm · data PhoBERT · phạm vi thanh toán mô phỏng",
        "",
        "### Tự kiểm tra (đã rà soát)",
        "",
        "| Tiêu chí | Kết quả |",
        "|----------|---------|",
        "| Storyline liên tục | ✅ Ch.1→2→3→kết luận |",
        "| Slide trùng ý | ✅ S21 nhấn E2E, không lặp S15/S19 |",
        "| Quá nhiều chữ | ✅ ≤6 bullet · ≤30 từ/slide |",
        "| Thiếu hình | ✅ 14 PNG gắn slide |",
        "| Chỉ đọc luận văn | ✅ Speaker notes kể chuyện |",
        "| Hội đồng hỏi \"vậy thì sao\" | ✅ S13, S21, S24 trả lời tích hợp & bước tiếp |",
        "",
        "**Lưu ý:** Speaker notes là script đầy đủ (~90–120 giây/slide). Cột TL là thời lượng **mục tiêu** khi rehearsal — cắt hoặc nói gọn trên slide ngắn (S2, S12, S13, S20–S21, S23).",
        "",
        "### Phân bổ thời lượng gợi ý",
        "",
        "| Khối | Slide | Phút mục tiêu |",
        "|------|-------|---------------|",
        "| Tiêu đề + Agenda | S1–S2 | ~1.0 |",
        "| Ch.1 | S3–S6 | ~5.5 |",
        "| Ch.2 | S7–S12 | ~6.0 |",
        "| Ch.3 | S13–S23 | ~10.5 |",
        "| Kết luận | S24 | ~1.0 |",
        "",
        "*Generated from `scripts/presentation1_slide_data.py`*",
    ])

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Saved: {OUT}")


if __name__ == "__main__":
    main()
