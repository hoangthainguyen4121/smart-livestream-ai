# -*- coding: utf-8 -*-
"""Draw thesis figures P1 — THESIS_FIGURE_SPEC v2.0 · PNG 300 dpi."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "docs" / "thesis-figures"
DPI = 300

plt.rcParams["font.family"] = "Times New Roman"
plt.rcParams["axes.unicode_minus"] = False

FIGURE_FILES = {
    "2.1": "hinh_2_1_quy_trinh_ho_tro_ban_hang.png",
    "2.2": "hinh_2_2_hai_tru_cot_cong_nghe.png",
    "2.3": "hinh_2_3_khoang_trong_nghien_cuu.png",
    "3.1": "hinh_3_1_kien_truc_tong_the.png",
    "3.2": "hinh_3_2_quy_trinh_xu_ly_tin_hieu_hinh_anh.png",
    "3.3": "hinh_3_3_quy_trinh_xac_dinh_y_dinh.png",
    "3.4": "hinh_3_4_quy_trinh_xac_dinh_san_pham.png",
    "3.5": "hinh_3_5_quy_trinh_ho_tro_ban_hang.png",
    "3.6": "hinh_3_6_quy_trinh_mua_hang.png",
    "3.7": "hinh_3_7_kien_truc_trien_khai.png",
}


def _save(fig, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def _box(ax, x, y, w, h, text, fc="#E8F4FD", ec="#1a5276", fs=9):
    p = FancyBboxPatch(
        (x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06",
        linewidth=1.2, edgecolor=ec, facecolor=fc,
    )
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, wrap=True)


def _arrow(ax, x1, y1, x2, y2, style="->"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=12, linewidth=1.2, color="#566573"))


def draw_2_1(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 10))
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 12)
    ax.axis("off")
    ax.text(4, 11.5, "Quy trình hỗ trợ bán hàng trong phiên phát trực tiếp", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 2.8, 10.2, 2.4, 0.7, "Người xem", fc="#D5F5E3")
    _arrow(ax, 4, 10.2, 4, 9.85)
    _box(ax, 0.8, 8.8, 6.4, 0.9, "Tương tác trong phiên\nBình luận · Thử sản phẩm · Cử chỉ/khuôn mặt", fc="#FCF3CF")
    _arrow(ax, 4, 8.8, 4, 8.45)
    _box(ax, 1.2, 7.4, 5.6, 0.8, "Ghi nhận & phân tích tín hiệu", fc="#D6EAF8")
    _arrow(ax, 4, 7.4, 4, 7.05)
    _box(ax, 1.0, 5.9, 6.0, 0.8, "Xác định ý định & ngữ cảnh sản phẩm", fc="#D6EAF8")
    _arrow(ax, 4, 5.9, 4, 5.55)
    _box(ax, 1.4, 4.4, 5.2, 0.9, "Trợ lý bán hàng thông minh", fc="#E8DAEF")
    _box(ax, 0.6, 2.6, 3.0, 1.0, "Phản hồi gợi ý\n/ tự động", fc="#D4EFDF")
    _box(ax, 4.4, 2.6, 3.0, 1.0, "Leo thang\ncho người phát", fc="#FADBD8")
    _arrow(ax, 2.7, 4.4, 2.1, 3.65)
    _arrow(ax, 5.3, 4.4, 5.9, 3.65)
    _arrow(ax, 2.1, 2.6, 3.2, 1.85)
    _arrow(ax, 5.9, 2.6, 4.8, 1.85)
    _box(ax, 1.8, 0.9, 4.4, 0.8, "Hỗ trợ chốt đơn / mua hàng mô phỏng", fc="#EBF5FB", fs=8)
    _arrow(ax, 4, 0.9, 4, 0.55)
    _box(ax, 2.4, 0.05, 3.2, 0.45, "Người phát quyết định cuối", fc="#FDEBD0", fs=8)
    _save(fig, path)


def draw_2_2(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")
    ax.text(5, 5.6, "Hai trụ cột công nghệ — hệ thống hỗ trợ bán hàng thông minh", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 2.5, 4.7, 5.0, 0.55, "Hệ thống hỗ trợ bán hàng thông minh", fc="#E8DAEF", fs=10)
    ax.text(2.5, 4.35, "Trụ cột: Thị giác máy tính", ha="center", fontsize=10, fontweight="bold")
    ax.text(7.5, 4.35, "Trụ cột: Xử lý ngôn ngữ", ha="center", fontsize=10, fontweight="bold")
    cv = [
        ("Thử sản phẩm trực quan\n(thực tế tăng cường)", "Hỗ trợ quyết định mua qua hình ảnh trực tiếp"),
        ("Nhận diện khuôn mặt\n(InsightFace)", "Ghi nhận người xem đã đăng ký"),
        ("Nhận dạng cử chỉ\n(MediaPipe)", "Biến cử chỉ thành tín hiệu hỗ trợ bán"),
    ]
    nlp = [
        ("Phân loại ý định\n(PhoBERT)", "Hiểu người xem muốn gì"),
        ("Xác định sản phẩm\n(TF-IDF)", "Gắn bình luận với mặt hàng"),
        ("Luật nghiệp vụ dự phòng", "Duy trì vận hành khi AI không sẵn sàng"),
    ]
    for i, (main, sub) in enumerate(cv):
        y = 3.2 - i * 1.05
        _box(ax, 0.4, y, 4.2, 0.75, main, fc="#D4EFDF")
        ax.text(0.5, y - 0.15, sub, fontsize=7, style="italic", color="#555")
    for i, (main, sub) in enumerate(nlp):
        y = 3.2 - i * 1.05
        _box(ax, 5.4, y, 4.2, 0.75, main, fc="#D6EAF8")
        ax.text(5.5, y - 0.15, sub, fontsize=7, style="italic", color="#555")
    ax.text(5, 0.15, "Ghi chú: triển khai trên trình duyệt web · lớp máy chủ · container (§3.7, Bảng 3.4)", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


def draw_2_3(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(11, 5.5))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 5.5)
    ax.axis("off")
    ax.text(5.5, 5.2, "Khoảng trống nghiên cứu", ha="center", fontsize=11, fontweight="bold")
    ax.text(1.8, 4.85, "Hiện trạng — rời rạc", ha="center", fontsize=9, fontweight="bold")
    boxes = [
        "Chatbot / phân loại ý định\n(không gắn thử sản phẩm)",
        "Thử sản phẩm AR\n(không gắn ý định mua)",
        "Nhận diện khuôn mặt / cử chỉ\n(không vào trợ lý)",
        "Nền tảng livestream\n(chỉ phát sóng)",
    ]
    for i, t in enumerate(boxes):
        _box(ax, 0.3, 3.5 - i * 0.85, 3.2, 0.65, t, fc="#FADBD8", fs=7.5)
    _arrow(ax, 3.6, 2.5, 4.4, 2.5)
    ax.text(4.0, 2.75, "KHOẢNG\nTRỐNG", ha="center", fontsize=8, fontweight="bold", color="#C0392B")
    _arrow(ax, 4.8, 2.5, 5.6, 2.5)
    ax.text(8.2, 4.85, "Đề xuất — tích hợp", ha="center", fontsize=9, fontweight="bold")
    _box(ax, 6.0, 2.0, 4.4, 2.2, "Hệ thống hỗ trợ bán hàng thông minh\n\n· CV + NLP\n· Trợ lý + mua hàng mô phỏng\n· Một nguyên mẫu trên trình duyệt web", fc="#D5F5E3", fs=8)
    ax.text(8.2, 1.55, "Tích hợp trong một phiên phát trực tiếp", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


def draw_3_1(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 10))
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 11)
    ax.axis("off")
    ax.text(4, 10.5, "Kiến trúc tổng thể (góc nhìn nghiệp vụ)", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 2.8, 9.5, 2.4, 0.6, "Người xem", fc="#D5F5E3")
    _arrow(ax, 4, 9.5, 4, 9.15)
    _box(ax, 1.0, 7.9, 6.0, 1.1, "Lớp giao diện phiên phát trực tiếp\nXem & thử sản phẩm · Trò chuyện · Giỏ hàng mô phỏng", fc="#D4EFDF", fs=8)
    ax.text(4, 7.55, "Điểm chạm duy nhất của người xem", ha="center", fontsize=7, style="italic")
    _arrow(ax, 4, 7.9, 4, 7.45)
    _box(ax, 0.6, 5.5, 6.8, 1.7, "Hệ thống hỗ trợ bán hàng thông minh\n· Ghi nhận tín hiệu hình ảnh → bảng sự kiện AI\n· Phân tích bình luận → ý định & sản phẩm\n· Trợ lý bán hàng → phản hồi & gợi ý", fc="#E8DAEF", fs=8)
    _arrow(ax, 4, 5.5, 4, 5.05)
    _box(ax, 1.2, 3.5, 5.6, 1.3, "Thành phần AI (phục vụ phân tích)\nCV: MediaPipe · InsightFace · AR\nNLP: PhoBERT · TF-IDF · luật", fc="#FCF3CF", fs=8)
    _arrow(ax, 4, 3.5, 4, 3.05)
    _box(ax, 2.2, 2.0, 3.6, 0.85, "Người phát trực tiếp\nTheo dõi trợ lý · quyết định chốt đơn", fc="#FDEBD0", fs=8)
    ax.annotate("", xy=(6.8, 8.4), xytext=(6.8, 2.4), arrowprops=dict(arrowstyle="->", linestyle="dashed", color="#7f8c8d"))
    ax.text(7.15, 5.4, "Ghim sản phẩm\n· can thiệp", fontsize=7, rotation=90, va="center")
    _save(fig, path)


def draw_3_2(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 7)
    ax.axis("off")
    ax.text(5.5, 6.6, "Quy trình xử lý tín hiệu hình ảnh", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 3.8, 5.7, 3.4, 0.55, "Camera thiết bị người xem", fc="#FCF3CF")
    for x, title in [(0.4, "Nhánh A — Thử sản phẩm"), (4.0, "Nhánh B — Khuôn mặt"), (7.6, "Nhánh C — Cử chỉ")]:
        _arrow(ax, 5.5, 5.7, x + 1.5, 5.35)
        ax.text(x + 1.5, 5.45, title, ha="center", fontsize=8, fontweight="bold")
        steps = {
            0.4: ["MediaPipe\n(điểm mốc mặt)", "Ánh xạ hiệu ứng\nsản phẩm ghim", "Thực tế tăng cường\n(kính · son · lọc)"],
            4.0: ["Gửi khung hình\nlớp máy chủ", "InsightFace\nso khớp embedding", "Kết quả\nnhận diện"],
            7.6: ["Luồng video\nlớp máy chủ", "MediaPipe\nnhận dạng cử chỉ", "Cooldown\nchống spam"],
        }[x]
        for j, s in enumerate(steps):
            _box(ax, x, 3.8 - j * 1.05, 3.0, 0.75, s, fc="#D4EFDF" if x == 0.4 else "#D6EAF8" if x == 4.0 else "#FADBD8", fs=7.5)
            if j < 2:
                _arrow(ax, x + 1.5, 3.8 - j * 1.05, x + 1.5, 3.05 - j * 1.05)
    _arrow(ax, 1.9, 1.65, 4.5, 1.0)
    _arrow(ax, 5.5, 1.65, 5.5, 1.0)
    _arrow(ax, 9.1, 1.65, 6.5, 1.0)
    _box(ax, 3.5, 0.35, 4.0, 0.55, "Bảng sự kiện AI → Người phát theo dõi", fc="#EBF5FB", fs=8)
    _save(fig, path)


def draw_3_3(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4)
    ax.axis("off")
    ax.text(5, 3.6, "Quy trình xác định ý định bình luận", ha="center", fontsize=11, fontweight="bold")
    nodes = ["Bình luận\nngười xem", "Chuẩn hóa\nvăn bản", "Luật /\nbiểu thức", "PhoBERT\n(lớp máy chủ)", "Kết hợp\nlai", "Ý định cuối\n+ độ tin cậy"]
    w, x0 = 1.35, 0.25
    for i, n in enumerate(nodes):
        x = x0 + i * 1.55
        _box(ax, x, 1.5, w, 1.0, n, fc="#D6EAF8" if i % 2 else "#D4EFDF", fs=7.5)
        if i < len(nodes) - 1:
            _arrow(ax, x + w, 2.0, x + w + 0.18, 2.0)
    ax.text(5, 0.5, "Luật dự phòng khi PhoBERT không phản hồi (EXP-12)", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


def draw_3_4(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.5)
    ax.axis("off")
    ax.text(5, 4.1, "Quy trình xác định sản phẩm được nhắc", ha="center", fontsize=11, fontweight="bold")
    nodes = ["Bình luận", "Chuẩn hóa", "TF-IDF\ndanh mục", "Thứ tự\nưu tiên\n(Bảng 3.2)", "Sản phẩm\nđược chọn", "Độ tin cậy\n+ nguồn"]
    w, x0 = 1.25, 0.2
    for i, n in enumerate(nodes):
        x = x0 + i * 1.55
        _box(ax, x, 1.6, w, 1.05, n, fc="#FCF3CF" if i == 2 else "#D6EAF8", fs=7.5)
        if i < len(nodes) - 1:
            _arrow(ax, x + w, 2.1, x + w + 0.25, 2.1)
    ax.text(5, 0.45, "Không sử dụng PhoBERT — hội tụ với ý định tại Hình 3.5", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


def draw_3_5(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")
    ax.text(5, 5.65, "Quy trình trợ lý bán hàng thông minh", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 0.5, 4.5, 2.2, 0.7, "Ý định (H.3.3)\n+ confidence", fc="#D6EAF8", fs=8)
    _box(ax, 7.3, 4.5, 2.2, 0.7, "Sản phẩm (H.3.4)\n+ confidence", fc="#FCF3CF", fs=8)
    _arrow(ax, 1.6, 4.5, 3.8, 3.85)
    _arrow(ax, 8.4, 4.5, 6.2, 3.85)
    _box(ax, 3.2, 3.35, 3.6, 0.65, "Trợ lý — hợp nhất ngữ cảnh", fc="#E8DAEF")
    _arrow(ax, 5, 3.35, 5, 2.95)
    _box(ax, 2.8, 2.1, 4.4, 0.7, "Luật nghiệp vụ (ý định · tin cậy · phiên)", fc="#FADBD8", fs=8)
    _arrow(ax, 5, 2.1, 5, 1.75)
    for i, (x, t) in enumerate([(0.3, "AUTO"), (2.5, "INBOX"), (4.7, "ESCALATE"), (6.9, "IGNORE")]):
        _box(ax, x, 0.85, 1.8, 0.55, t, fc="#D4EFDF", fs=8)
    _arrow(ax, 5, 1.75, 5, 1.45)
    _box(ax, 2.5, 0.05, 5.0, 0.55, "Phản hồi chat / bảng trợ lý → Người phát", fc="#EBF5FB", fs=8)
    _save(fig, path)


def draw_3_6(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 7))
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 7)
    ax.axis("off")
    ax.text(4, 6.6, "Quy trình mua hàng mô phỏng", ha="center", fontsize=11, fontweight="bold")
    ys = [5.8, 4.9, 4.0, 3.1]
    labels = ["Người xem chọn sản phẩm", "Thêm vào giỏ hàng (tạm tính)", "Mở form thanh toán mô phỏng", "Chọn phương thức thanh toán"]
    for y, lb in zip(ys, labels):
        _box(ax, 1.5, y, 5.0, 0.55, lb, fc="#D6EAF8", fs=8)
        _arrow(ax, 4, y, 4, y - 0.35)
    _box(ax, 0.5, 1.5, 3.0, 0.9, "COD\n→ cod_confirmed\nMã LS-*", fc="#D4EFDF", fs=7.5)
    _box(ax, 4.5, 1.5, 3.0, 0.9, "Thanh toán điện tử\nmô phỏng (QR giả)\n→ paid · LS-*", fc="#D4EFDF", fs=7.5)
    _arrow(ax, 4, 2.75, 2.0, 2.45)
    _arrow(ax, 4, 2.75, 6.0, 2.45)
    ax.text(4, 0.7, "Lưu trữ chỉ trong phiên trình duyệt — không CSDL · không cổng thanh toán thật", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


def draw_3_7(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 7))
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 7)
    ax.axis("off")
    ax.text(4, 6.55, "Kiến trúc triển khai nguyên mẫu", ha="center", fontsize=11, fontweight="bold")
    _box(ax, 2.0, 5.7, 4.0, 0.55, "Máy người dùng — Trình duyệt web", fc="#FDEBD0", fs=8)
    _arrow(ax, 4, 5.7, 4, 5.35)
    _box(ax, 1.2, 4.5, 5.6, 0.65, "Lớp giao diện (React / Vite)", fc="#D4EFDF", fs=8)
    ax.text(4, 4.25, "HTTP · WebSocket", ha="center", fontsize=7.5)
    _arrow(ax, 4, 4.5, 4, 4.15)
    _box(ax, 0.8, 2.9, 6.4, 1.0, "Lớp máy chủ ứng dụng (FastAPI)\nChat · nhận diện · chuyển tiếp NLP", fc="#D6EAF8", fs=8)
    _arrow(ax, 4, 2.9, 4, 2.55)
    _box(ax, 1.5, 1.6, 5.0, 0.75, "Dịch vụ AI — PhoBERT (phân loại ý định)", fc="#FCF3CF", fs=8)
    rect = FancyBboxPatch((0.4, 1.2), 7.2, 5.2, boxstyle="round,pad=0.02", linewidth=1, edgecolor="#95a5a6", facecolor="none", linestyle="--")
    ax.add_patch(rect)
    ax.text(7.0, 6.15, "Docker Compose\n(tùy chọn)", fontsize=7, ha="right")
    ax.text(4, 0.55, "FastAPI · PhoBERT Service — chi tiết cổng: Bảng 3.4", ha="center", fontsize=7.5, style="italic")
    _save(fig, path)


DRAWERS = {
    "2.1": draw_2_1,
    "2.2": draw_2_2,
    "2.3": draw_2_3,
    "3.1": draw_3_1,
    "3.2": draw_3_2,
    "3.3": draw_3_3,
    "3.4": draw_3_4,
    "3.5": draw_3_5,
    "3.6": draw_3_6,
    "3.7": draw_3_7,
}


def generate_all(fig_dir: Path | None = None) -> list[Path]:
    out_dir = fig_dir or FIG_DIR
    paths = []
    for key, drawer in DRAWERS.items():
        path = out_dir / FIGURE_FILES[key]
        drawer(path)
        paths.append(path)
        print(f"Generated: {path}")
    return paths
