import type { ReactNode } from "react";

import {
  COMMERCE_CTA_SUFFIX,
  PURCHASE_ADD_TO_CART_PHRASE,
  PURCHASE_CHECKOUT_ORDER_PHRASE,
  PURCHASE_CLARIFICATION_REPLY_REGEX,
} from "../sales-nlp/commerceReplyPhrases";

function renderCommerceCtaSuffix(): ReactNode {
  return (
    <>
      Bạn có thể{" "}
      <span className="chatReplyHighlight chatReplyHighlightAction">{PURCHASE_ADD_TO_CART_PHRASE}</span>
      {" bên dưới hoặc nhắn "}
      <span className="chatReplyHighlight chatReplyHighlightAction">{PURCHASE_CHECKOUT_ORDER_PHRASE}</span>
      {" để thanh toán."}
    </>
  );
}

export function renderAssistantReplyText(text: string): ReactNode {
  const purchaseMatch = text.match(PURCHASE_CLARIFICATION_REPLY_REGEX);
  if (purchaseMatch) {
    const productName = purchaseMatch[1];
    return (
      <>
        Bạn muốn chốt{" "}
        <span className="chatReplyHighlight chatReplyHighlightProduct">{productName}</span>
        {" phải không ạ? "}
        {renderCommerceCtaSuffix()}
      </>
    );
  }

  if (text.endsWith(COMMERCE_CTA_SUFFIX)) {
    const prefix = text.slice(0, -COMMERCE_CTA_SUFFIX.length);
    return (
      <>
        {prefix}
        {renderCommerceCtaSuffix()}
      </>
    );
  }

  return text;
}
