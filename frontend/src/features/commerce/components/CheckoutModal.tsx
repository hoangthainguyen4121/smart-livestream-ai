import { formatVnd } from "../cartLogic";
import {
  formatCheckoutBlockers,
  getCheckoutValidationErrors,
  isCheckoutFormValid,
} from "../checkoutService";
import type { CartLineItem, CheckoutForm } from "../commerceTypes";
import {
  PAYMENT_METHOD_LABELS,
} from "../commerceTypes";

type CheckoutModalProps = {
  open: boolean;
  items: CartLineItem[];
  subtotal: number;
  form: CheckoutForm;
  onClose: () => void;
  onChange: <K extends keyof CheckoutForm>(field: K, value: CheckoutForm[K]) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
};

export function CheckoutModal({
  open,
  items,
  subtotal,
  form,
  onClose,
  onChange,
  onSubmit,
  submitting = false,
  error,
}: CheckoutModalProps) {
  if (!open) {
    return null;
  }

  const total = subtotal;
  const validationErrors = getCheckoutValidationErrors(form, items.length);
  const isValid = isCheckoutFormValid(form, items.length);
  const blockerMessage = formatCheckoutBlockers(validationErrors);

  return (
    <div className="checkoutModalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="checkoutModal"
        role="dialog"
        aria-modal="true"
        aria-label="Xác nhận đơn hàng"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cardHeader">
          <h2>Xác nhận đơn hàng</h2>
          <button type="button" className="checkoutCloseButton" onClick={onClose}>
            Đóng
          </button>
        </div>

        <p className="panelDescription">
          Dữ liệu chỉ dùng cho demo luận văn — không lưu thông tin cá nhân thật.
        </p>

        <div className="checkoutGrid">
          <div className="checkoutFormSection">
            <label className={validationErrors.customerName ? "checkoutFieldInvalid" : undefined}>
              Họ tên
              <input
                value={form.customerName}
                onChange={(event) => onChange("customerName", event.target.value)}
                placeholder="Nguyễn Văn A"
                aria-invalid={Boolean(validationErrors.customerName)}
              />
              {validationErrors.customerName ? (
                <span className="checkoutFieldError">{validationErrors.customerName}</span>
              ) : null}
            </label>
            <label className={validationErrors.phone ? "checkoutFieldInvalid" : undefined}>
              Số điện thoại
              <input
                value={form.phone}
                onChange={(event) => onChange("phone", event.target.value)}
                placeholder="0901234567"
                aria-invalid={Boolean(validationErrors.phone)}
              />
              {validationErrors.phone ? (
                <span className="checkoutFieldError">{validationErrors.phone}</span>
              ) : null}
            </label>
            <label className={validationErrors.address ? "checkoutFieldInvalid" : undefined}>
              Địa chỉ giao hàng
              <textarea
                value={form.address}
                onChange={(event) => onChange("address", event.target.value)}
                placeholder="Quận/Huyện, TP.HCM"
                rows={3}
                aria-invalid={Boolean(validationErrors.address)}
              />
              {validationErrors.address ? (
                <span className="checkoutFieldError">{validationErrors.address}</span>
              ) : null}
            </label>
            <label>
              Phương thức thanh toán
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  onChange("paymentMethod", event.target.value as CheckoutForm["paymentMethod"])
                }
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {form.paymentMethod === "mock_qr" ? (
              <label>
                Kết quả mô phỏng
                <select
                  value={form.sandboxResult}
                  onChange={(event) =>
                    onChange(
                      "sandboxResult",
                      event.target.value as CheckoutForm["sandboxResult"],
                    )
                  }
                >
                  <option value="success">Thanh toán thành công</option>
                  <option value="failure">Thanh toán thất bại</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="checkoutSummarySection">
            <h3>Đơn hàng</h3>
            <ul className="checkoutItemList">
              {items.map((item) => (
                <li key={item.lineId}>
                  <span>
                    {item.productName} × {item.quantity}
                  </span>
                  <span>{formatVnd(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="checkoutTotals">
              <div>
                <dt>Tạm tính</dt>
                <dd>{formatVnd(subtotal)}</dd>
              </div>
              <div>
                <dt>Tổng thanh toán</dt>
                <dd>{formatVnd(total)}</dd>
              </div>
            </dl>

            {form.paymentMethod === "mock_qr" ? (
              <div className="mockQrPanel" aria-label="Thanh toán online mô phỏng">
                <div className="mockQrCode">THANH TOÁN DEMO</div>
                <p>
                  Hệ thống sẽ lưu trạng thái thanh toán mô phỏng trên máy chủ theo kết quả bạn chọn.
                </p>
              </div>
            ) : (
              <p className="mockCodNote">
                COD: đơn được xác nhận ngay và khách thanh toán khi nhận hàng.
              </p>
            )}

            {!isValid && blockerMessage ? (
              <p className="checkoutValidationSummary" role="status">
                {blockerMessage}
              </p>
            ) : null}
            {error ? <p className="checkoutValidationSummary" role="alert">{error}</p> : null}

            <button
              type="button"
              className="cartCheckoutButton"
              disabled={!isValid || submitting}
              aria-disabled={!isValid}
              title={!isValid ? blockerMessage : undefined}
              onClick={onSubmit}
            >
              {submitting ? "Đang tạo đơn..." : "Xác nhận đặt hàng"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
