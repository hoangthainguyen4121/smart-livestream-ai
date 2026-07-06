import { describe, expect, it } from "vitest";

import {
  buildPurchaseClarificationReply,
  formatHighlightedProductName,
} from "./commerceReplyPhrases";

describe("commerceReplyPhrases", () => {
  it("uppercases product name and uses Vietnamese checkout wording", () => {
    const reply = buildPurchaseClarificationReply("Son Ruby Đỏ");

    expect(reply).toBe(
      "Bạn muốn chốt SON RUBY ĐỎ phải không ạ? Bạn có thể thêm vào giỏ hàng bên dưới hoặc nhắn chốt đơn để thanh toán.",
    );
    expect(reply).not.toContain("checkout");
    expect(reply).not.toContain("demo");
  });

  it("formats Vietnamese product names in uppercase", () => {
    expect(formatHighlightedProductName("Kính thời trang A")).toBe("KÍNH THỜI TRANG A");
  });
});
