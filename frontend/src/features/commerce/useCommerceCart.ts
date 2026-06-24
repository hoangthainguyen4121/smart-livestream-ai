import { useCallback, useMemo, useState } from "react";

import { getProductById } from "../product-catalog";
import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import {
  addToCart,
  getCartItemCount,
  getCartSubtotal,
  removeFromCart,
  updateCartQuantity,
} from "./cartLogic";
import {
  createMockOrder,
  getDefaultCheckoutForm,
  markMockOrderPaid,
} from "./checkoutService";
import type {
  AddToCartInput,
  CartLineItem,
  CheckoutForm,
  CommerceActionType,
  CommerceSuggestedAction,
  MockOrder,
} from "./commerceTypes";
import { SHIPPING_FEES } from "./commerceTypes";

type UseCommerceCartOptions = {
  onOpenCart?: () => void;
};

export function useCommerceCart(options: UseCommerceCartOptions = {}) {
  const { onOpenCart } = options;
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [order, setOrder] = useState<MockOrder | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(getDefaultCheckoutForm);
  const [isPaying, setIsPaying] = useState(false);

  const subtotal = useMemo(() => getCartSubtotal(items), [items]);
  const itemCount = useMemo(() => getCartItemCount(items), [items]);
  const shippingFee = SHIPPING_FEES[checkoutForm.shippingMethod];
  const estimatedTotal = subtotal + (items.length > 0 ? shippingFee : 0);

  const addProductToCart = useCallback((input: AddToCartInput) => {
    setItems((current) => addToCart(current, input));
  }, []);

  const addProductById = useCallback(
    (
      productId: string,
      options?: {
        quantity?: number;
        color?: string | null;
        size?: string | null;
      },
    ) => {
      const product = getProductById(productId);
      if (!product) {
        return false;
      }

      addProductToCart({
        product,
        quantity: options?.quantity,
        color: options?.color,
        size: options?.size,
      });
      return true;
    },
    [addProductToCart],
  );

  const removeLine = useCallback((lineId: string) => {
    setItems((current) => removeFromCart(current, lineId));
  }, []);

  const updateLineQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((current) => updateCartQuantity(current, lineId, quantity));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openCheckout = useCallback(() => {
    setCheckoutOpen(true);
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    setIsPaying(false);
  }, []);

  const updateCheckoutField = useCallback(
    <K extends keyof CheckoutForm>(field: K, value: CheckoutForm[K]) => {
      setCheckoutForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const submitCheckout = useCallback(() => {
    if (items.length === 0) {
      return null;
    }

    const nextOrder = createMockOrder(items, checkoutForm);
    setOrder(nextOrder);
    setCheckoutOpen(false);
    clearCart();
    setCheckoutForm(getDefaultCheckoutForm());

    if (checkoutForm.paymentMethod === "mock_qr") {
      setIsPaying(true);
      window.setTimeout(() => {
        setOrder((current) => (current ? markMockOrderPaid(current) : current));
        setIsPaying(false);
      }, 1500);
    }

    return nextOrder;
  }, [checkoutForm, clearCart, items]);

  const handleCommerceAction = useCallback(
    (
      actionType: CommerceActionType,
      productId?: string,
      options?: { quantity?: number; color?: string | null; size?: string | null },
    ) => {
      switch (actionType) {
        case "add_to_cart":
          if (productId) {
            addProductById(productId, options);
          }
          return;
        case "open_checkout":
          openCheckout();
          return;
        case "open_cart":
          onOpenCart?.();
          return;
      }
    },
    [addProductById, openCheckout, onOpenCart],
  );

  const applySuggestedAction = useCallback(
    (action: CommerceSuggestedAction) => {
      handleCommerceAction(action.type, action.productId, {
        quantity: action.quantity,
        color: action.color,
        size: action.size,
      });
    },
    [handleCommerceAction],
  );

  const addPinnedProduct = useCallback(
    (product: CatalogProduct, quantity = 1) => {
      addProductToCart({ product, quantity });
    },
    [addProductToCart],
  );

  return {
    items,
    order,
    checkoutOpen,
    checkoutForm,
    isPaying,
    subtotal,
    itemCount,
    shippingFee,
    estimatedTotal,
    addProductToCart,
    addProductById,
    addPinnedProduct,
    removeLine,
    updateLineQuantity,
    clearCart,
    openCheckout,
    closeCheckout,
    updateCheckoutField,
    submitCheckout,
    handleCommerceAction,
    applySuggestedAction,
    setCheckoutOpen,
  };
}

export type CommerceCartApi = ReturnType<typeof useCommerceCart>;
