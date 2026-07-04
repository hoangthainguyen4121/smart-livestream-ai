import { describe, expect, it } from "vitest";

import { formatTranslation, translations, type TranslationKey } from "../../i18n/translations";
import { formatIntentLabel, getIntentTranslationKey } from "./formatChatIntentLabel";

function t(key: TranslationKey, params?: Record<string, string | number>) {
  const template = translations.vi[key];
  return params ? formatTranslation(template, params) : template;
}

describe("formatChatIntentLabel", () => {
  it("maps ML intent labels to Vietnamese translations", () => {
    expect(formatIntentLabel("COMPLAINT", t)).toBe("Khiếu nại");
    expect(formatIntentLabel("PURCHASE_INTENT", t)).toBe("Muốn mua");
    expect(formatIntentLabel("ASK_PRICE", t)).toBe("Hỏi giá");
    expect(formatIntentLabel("ASK_VARIANT", t)).toBe("Hỏi màu/biến thể");
    expect(formatIntentLabel("SPAM_TOXIC", t)).toBe("Spam");
  });

  it("falls back to unknown label for unsupported intents", () => {
    expect(getIntentTranslationKey("NOT_A_REAL_INTENT")).toBe("intentUnknown");
    expect(formatIntentLabel("NOT_A_REAL_INTENT", t)).toBe("Không rõ");
  });
});
