import { describe, expect, it } from "vitest";

import { hasLimeTokenBars, resolveModelExplanation } from "./modelExplanationResolver";

describe("resolveModelExplanation", () => {
  it("returns offline LIME lookup for known greeting case", () => {
    const result = resolveModelExplanation({
      comment: "chào buổi tối",
      normalizedText: "chao buoi toi",
    });

    expect(result?.source).toBe("lime_lookup");
    expect(result?.predictedLabel).toBe("PURCHASE_INTENT");
    expect(result?.positiveFeatures.length).toBeGreaterThan(0);
  });

  it("falls back to ML bridge when lookup missing", () => {
    const result = resolveModelExplanation({
      comment: "còn hàng không shop",
      normalizedText: "con hang khong shop",
      mlBridge: {
        mlAvailable: true,
        mlIntent: "ASK_STOCK",
        mlConfidence: 0.91,
        mappedIntent: "ASK_STOCK",
        mappedAction: "AUTO_REPLY_SUGGESTED",
        suppressEvent: false,
        isComplaintEscalation: false,
        isSpamModeration: false,
        usedMl: true,
        intentSource: "ml",
      },
    });

    expect(result?.source).toBe("ml_bridge");
    expect(result?.predictedLabel).toBe("ASK_STOCK");
    expect(result?.positiveFeatures).toEqual([]);
  });

  it("detects token bars only for lime lookup", () => {
    const lime = resolveModelExplanation({
      comment: "giá?",
      normalizedText: "gia?",
    });
    const bridge = resolveModelExplanation({
      comment: "random",
      normalizedText: "random",
      mlBridge: {
        mlAvailable: true,
        mlIntent: "ASK_PRICE",
        mlConfidence: 0.8,
        mappedIntent: "ASK_PRICE",
        mappedAction: "AUTO_REPLY_SUGGESTED",
        suppressEvent: false,
        isComplaintEscalation: false,
        isSpamModeration: false,
        usedMl: true,
        intentSource: "ml",
      },
    });

    expect(hasLimeTokenBars(lime)).toBe(true);
    expect(hasLimeTokenBars(bridge)).toBe(false);
  });
});
