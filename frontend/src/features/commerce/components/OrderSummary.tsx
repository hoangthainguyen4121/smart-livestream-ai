import { formatVnd } from "../cartLogic";
import type { MockOrder } from "../commerceTypes";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "../commerceTypes";

type OrderSummaryProps = {
  order: MockOrder | null;
  isPaying?: boolean;
};

export function OrderSummary({ order, isPaying = false }: OrderSummaryProps) {
  if (!order) {
    return (
      <section className="videoCard orderSummary" aria-label="Order summary">
        <div className="cardHeader">
          <h2>Đơn hàng demo</h2>
          <span className="status">Chưa có đơn</span>
        </div>
        <p className="emptyState">Checkout thành công sẽ hiển thị mã đơn và trạng thái thanh toán giả lập.</p>
      </section>
    );
  }

  return (
    <section className="videoCard orderSummary" aria-label="Order summary">
      <div className="cardHeader">
        <h2>Đơn hàng demo</h2>
        <span className={`orderStatusBadge orderStatusBadge--${order.status}`}>
          {isPaying ? "Đang xử lý mock QR..." : ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <dl className="orderSummaryDetails">
        <div>
          <dt>Mã đơn</dt>
          <dd>{order.orderId}</dd>
        </div>
        <div>
          <dt>Khách hàng</dt>
          <dd>{order.checkout.customerName}</dd>
        </div>
        <div>
          <dt>Thanh toán</dt>
          <dd>{PAYMENT_METHOD_LABELS[order.checkout.paymentMethod]}</dd>
        </div>
        <div>
          <dt>Tổng tiền</dt>
          <dd>{formatVnd(order.total)}</dd>
        </div>
      </dl>

      <ul className="checkoutItemList">
        {order.items.map((item) => (
          <li key={item.lineId}>
            <span>
              {item.productName} × {item.quantity}
              {item.color ? ` · ${item.color}` : ""}
              {item.size ? ` · ${item.size}` : ""}
            </span>
            <span>{formatVnd(item.unitPrice * item.quantity)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
