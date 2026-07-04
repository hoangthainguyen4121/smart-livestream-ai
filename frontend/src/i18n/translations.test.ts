import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, formatTranslation, translations } from "./translations";

describe("i18n translations", () => {
  it("defaults to Vietnamese locale", () => {
    expect(DEFAULT_LOCALE).toBe("vi");
  });

  it("provides Vietnamese strings for main demo labels", () => {
    expect(translations.vi.appTitle).toBe("Demo livestream AI");
    expect(translations.vi.startStream).toBe("Bắt đầu live");
    expect(translations.vi.addToCart).toBe("Thêm vào giỏ");
  });

  it("interpolates template params", () => {
    expect(formatTranslation("{count} người xem", { count: 3 })).toBe("3 người xem");
  });
});
