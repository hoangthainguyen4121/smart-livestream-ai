# Checkout Demo — Mock Chat Commerce

Luồng demo giỏ hàng / checkout / thanh toán giả lập cho livestream PoC. **Không** kết nối cổng thanh toán thật và **không** lưu dữ liệu cá nhân thật.

## Chạy demo

1. Backend: `uvicorn app.main:app --reload --port 8000` (từ thư mục `backend`)
2. (Tuỳ chọn) PhoBERT bridge: `python scripts/serve_intent_api.py --model-dir artifacts/phobert_base_combined_hardcases_v2 --port 8010`
3. Frontend: `npm run dev` → mở `/` hoặc `/poc/sales-lab`

## Thành phần UI

| Panel | Vai trò |
|-------|---------|
| **Giỏ hàng livestream** | Thêm/xóa sản phẩm, chỉnh SL, tạm tính |
| **Checkout demo** (modal) | Họ tên, SĐT, địa chỉ, ship, COD / Mock QR |
| **Đơn hàng demo** | Mã đơn `LS-…`, trạng thái `pending` / `paid` / `cod_confirmed` |
| **AI Sales Assistant** | Nút **Commerce actions** theo intent chat |

## Intent → hành động commerce

| Intent | Gợi ý trong panel |
|--------|-------------------|
| `ASK_PRICE` | **Thêm vào giỏ**, **Xem giỏ hàng** |
| `ASK_LINK` | **Thêm vào giỏ**, **Mở giỏ livestream** |
| `PURCHASE_INTENT` | **Thêm vào giỏ**, **Checkout ngay** |

PhoBERT bridge vẫn hoạt động song song (hybrid với rule-based NLP).

## Kịch bản chat 5 bước (demo luận văn)

Ghim sản phẩm **Son Velvet Rose** (hoặc sản phẩm bất kỳ) trước khi bắt đầu.

| # | Comment viewer | Kỳ vọng |
|---|----------------|---------|
| 1 | `son này bao nhiêu tiền vậy shop?` | Intent `ASK_PRICE`, reply có giá + nút **Thêm vào giỏ** |
| 2 | Bấm **Thêm vào giỏ** trên panel AI hoặc **Thêm {sản phẩm ghim}** trên Giỏ hàng | 1 dòng trong giỏ, tạm tính cập nhật |
| 3 | `cho mình link mua son này với` | Intent `ASK_LINK`, nút **Mở giỏ livestream** (scroll tới giỏ) |
| 4 | `chốt 1 cây son nhé` | Intent `PURCHASE_INTENT`, nút **Checkout ngay** mở modal |
| 5 | Điền form demo → chọn **COD** hoặc **Mock QR** → **Xác nhận đặt hàng demo** | Mã đơn `LS-…`; COD → `cod_confirmed`; Mock QR → `pending` rồi `paid` sau ~1.5s |

## Trạng thái thanh toán mock

| Phương thức | Trạng thái ban đầu | Sau xử lý |
|-------------|-------------------|-----------|
| COD | `cod_confirmed` | — |
| Mock QR | `pending` | `paid` (timeout giả lập) |

## Lưu ý bảo mật / phạm vi

- Form chỉ giữ state trong trình duyệt phiên hiện tại.
- Dùng tên/SĐT/địa chỉ **giả** khi trình diễn.
- Không gọi API payment gateway bên thứ ba.

## Kiểm thử tự động

```bash
cd frontend
npm test
```

Chạy unit test cho `cartLogic` và `checkoutService`.
