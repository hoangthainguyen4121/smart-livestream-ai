import { useEffect } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import { formatVnd } from "../cartLogic";
import type { CartLineItem } from "../commerceTypes";

type CartDrawerButtonProps = {
  itemCount: number;
  onClick: () => void;
};

export function CartDrawerButton({ itemCount, onClick }: CartDrawerButtonProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      className="cartFab"
      onClick={onClick}
      aria-label={t("cartOpenAria", { count: itemCount })}
    >
      <CartIcon />
      <span className="cartFabLabel">{t("cartTitle")}</span>
      {itemCount > 0 ? <span className="cartFabBadge">{itemCount > 99 ? "99+" : itemCount}</span> : null}
    </button>
  );
}

type CartPanelProps = {
  open: boolean;
  onClose: () => void;
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
  open,
  onClose,
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
  const { t } = useI18n();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="cartDrawerBackdrop" role="presentation" onClick={onClose}>
      <aside
        className="cartDrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cartDrawerHeader">
          <div>
            <h2 id="cart-drawer-title">{t("cartTitle")}</h2>
            <span className="status">{t("items", { count: itemCount })}</span>
          </div>
          <button type="button" className="cartDrawerClose" onClick={onClose} aria-label={t("cartClose")}>
            ×
          </button>
        </div>

        <div className="cartDrawerBody">
          {onAddPinnedProduct ? (
            <div className="cartQuickActions">
              <button type="button" onClick={onAddPinnedProduct}>
                {t("cartAddPinned", { product: pinnedProductName ?? t("cartPinnedFallback") })}
              </button>
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="emptyState">{t("cartEmpty")}</p>
          ) : (
            <ul className="cartItemList">
              {items.map((item) => (
                <li className="cartItem" key={item.lineId}>
                  <div className="cartItemHeader">
                    <strong>{item.productName}</strong>
                    <button
                      type="button"
                      className="cartRemoveButton"
                      onClick={() => onRemoveItem(item.lineId)}
                    >
                      {t("cartRemove")}
                    </button>
                  </div>
                  <div className="cartItemMeta">
                    {item.color ? (
                      <span>
                        {t("cartColor")}: {item.color}
                      </span>
                    ) : null}
                    {item.size ? (
                      <span>
                        {t("cartSize")}: {item.size}
                      </span>
                    ) : null}
                  </div>
                  <div className="cartItemFooter">
                    <label>
                      {t("cartQty")}
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
        </div>

        <div className="cartSummary">
          <div>
            <span>{t("cartSubtotal")}</span>
            <strong>{formatVnd(subtotal)}</strong>
          </div>
          <div className="cartSummaryActions">
            <button type="button" onClick={onClearCart} disabled={items.length === 0}>
              {t("cartClear")}
            </button>
            <button
              type="button"
              className="cartCheckoutButton"
              onClick={onCheckout}
              disabled={items.length === 0}
            >
              {t("cartCheckout")}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 4h1.7l1.2 11.2a1.5 1.5 0 0 0 1.5 1.3h9.3a1.5 1.5 0 0 0 1.5-1.2L20.5 8H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
