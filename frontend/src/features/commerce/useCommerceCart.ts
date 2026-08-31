import { useCallback, useMemo, useState } from "react";

import type { CatalogProduct } from "../product-catalog/productCatalogTypes";
import { checkoutOrder } from "../../api/commerce";
import {
  addToCart,
  getCartItemCount,
  getCartSubtotal,
  removeFromCart,
  updateCartQuantity,
} from "./cartLogic";
import {
  getDefaultCheckoutForm,
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
  products?: CatalogProduct[];
  roomId?: string | null;
};

export function useCommerceCart(options: UseCommerceCartOptions = {}) {
  const { onOpenCart, products = [], roomId = null } = options;
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [order, setOrder] = useState<MockOrder | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(getDefaultCheckoutForm);
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
      const product = products.find((entry) => entry.id === productId);
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
    [addProductToCart, products],
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

  const submitCheckout = useCallback(async () => {
    if (items.length === 0) {
      return null;
    }
    setIsPaying(true);
    setCheckoutError(null);
    try {
      const nextOrder = await checkoutOrder(items, checkoutForm, { roomId });
      setOrder(nextOrder);
      setCheckoutOpen(false);
      clearCart();
      setCheckoutForm(getDefaultCheckoutForm());
      return nextOrder;
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout failed.");
      return null;
    } finally {
      setIsPaying(false);
    }
  }, [checkoutForm, clearCart, items, roomId]);

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
    checkoutError,
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
