import { formatVnd } from "../cartLogic";
import {
  formatCheckoutBlockers,
  getCheckoutValidationErrors,
  isCheckoutFormValid,
} from "../checkoutService";
import type { CartLineItem, CheckoutForm } from "../commerceTypes";
import {
  PAYMENT_METHOD_LABELS,
  SHIPPING_FEES,
  SHIPPING_METHOD_LABELS,
} from "../commerceTypes";

type CheckoutModalProps = {
  open: boolean;
  items: CartLineItem[];
  subtotal: number;
  form: CheckoutForm;
  onClose: () => void;
  onChange: <K extends keyof CheckoutForm>(field: K, value: CheckoutForm[K]) => void;
  onSubmit: () => void;
};

export function CheckoutModal({
  open,
  items,
  subtotal,
  form,
  onClose,
  onChange,
  onSubmit,
}: CheckoutModalProps) {
  if (!open) {
    return null;
  }

  const shippingFee = SHIPPING_FEES[form.shippingMethod];
  const total = subtotal + shippingFee;
  const validationErrors = getCheckoutValidationErrors(form, items.length);
  const isValid = isCheckoutFormValid(form, items.length);
  const blockerMessage = formatCheckoutBlockers(validationErrors);

  return (
    <div className="checkoutModalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="checkoutModal"
        role="dialog"
        aria-modal="true"
        aria-label="Checkout demo"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cardHeader">
          <h2>Checkout demo</h2>
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
              Phương thức giao hàng
              <select
                value={form.shippingMethod}
                onChange={(event) =>
                  onChange("shippingMethod", event.target.value as CheckoutForm["shippingMethod"])
                }
              >
                {Object.entries(SHIPPING_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thanh toán
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
                <dt>Phí ship</dt>
                <dd>{formatVnd(shippingFee)}</dd>
              </div>
              <div>
                <dt>Tổng</dt>
                <dd>{formatVnd(total)}</dd>
              </div>
            </dl>

            {form.paymentMethod === "mock_qr" ? (
              <div className="mockQrPanel" aria-label="Mock QR payment">
                <div className="mockQrCode">QR DEMO</div>
                <p>Quét mã giả lập sau khi đặt hàng. Trạng thái sẽ chuyển sang paid sau ~1.5 giây.</p>
              </div>
            ) : (
              <p className="mockCodNote">COD: đơn sẽ được đánh dấu cod_confirmed ngay khi đặt.</p>
            )}

            {!isValid && blockerMessage ? (
              <p className="checkoutValidationSummary" role="status">
                {blockerMessage}
              </p>
            ) : null}

            <button
              type="button"
              className="cartCheckoutButton"
              disabled={!isValid}
              aria-disabled={!isValid}
              title={!isValid ? blockerMessage : undefined}
              onClick={onSubmit}
            >
              Xác nhận đặt hàng demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
