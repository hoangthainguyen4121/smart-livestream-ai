import { formatVnd } from "../cartLogic";
import type { CartLineItem } from "../commerceTypes";

type CartPanelProps = {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  onAddPinnedProduct?: () => void;
  pinnedProductName?: string;
  onRemoveItem: (lineId: string) => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
  onCheckout: () => void;
  onClearCart: () => void;
};

export function CartPanel({
  items,
  itemCount,
  subtotal,
  onAddPinnedProduct,
  pinnedProductName,
  onRemoveItem,
  onUpdateQuantity,
  onCheckout,
  onClearCart,
}: CartPanelProps) {
  return (
    <section className="videoCard cartPanel" aria-label="Livestream cart">
      <div className="cardHeader">
        <h2>Giỏ hàng livestream</h2>
        <span className="status">{itemCount} sản phẩm</span>
      </div>

      {onAddPinnedProduct ? (
        <div className="cartQuickActions">
          <button type="button" onClick={onAddPinnedProduct}>
            Thêm {pinnedProductName ?? "sản phẩm đang ghim"}
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="emptyState">Giỏ hàng trống. Hỏi giá hoặc chốt đơn trong chat để thêm sản phẩm.</p>
      ) : (
        <ul className="cartItemList">
          {items.map((item) => (
            <li className="cartItem" key={item.lineId}>
              <div className="cartItemHeader">
                <strong>{item.productName}</strong>
                <button type="button" className="cartRemoveButton" onClick={() => onRemoveItem(item.lineId)}>
                  Xóa
                </button>
              </div>
              <div className="cartItemMeta">
                {item.color ? <span>Màu: {item.color}</span> : null}
                {item.size ? <span>Size: {item.size}</span> : null}
              </div>
              <div className="cartItemFooter">
                <label>
                  SL
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateQuantity(item.lineId, Number.parseInt(event.target.value, 10) || 1)
                    }
                  />
                </label>
                <span>{formatVnd(item.unitPrice * item.quantity)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="cartSummary">
        <div>
          <span>Tạm tính</span>
          <strong>{formatVnd(subtotal)}</strong>
        </div>
        <div className="cartSummaryActions">
          <button type="button" onClick={onClearCart} disabled={items.length === 0}>
            Xóa giỏ
          </button>
          <button
            type="button"
            className="cartCheckoutButton"
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            <span className="cartCheckoutButtonIcon" aria-hidden="true">
              💳
            </span>
            Thanh toán
          </button>
        </div>
      </div>
    </section>
  );
}
