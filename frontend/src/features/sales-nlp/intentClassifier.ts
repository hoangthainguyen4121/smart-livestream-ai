import type { SalesNlpIntent } from "./salesNlpTypes";

const COLOR_TOKENS =
  "xanh|den|do|vang|trang|tim|hong|xam|nau|be|ruby|cam|xanh la|xanh duong";

export type IntentRule = {
  intent: Exclude<SalesNlpIntent, "UNKNOWN">;
  patterns: Array<{ regex: RegExp; label: string }>;
  baseConfidence: number;
};

export const INTENT_RULES: IntentRule[] = [
  {
    intent: "PURCHASE_INTENT",
    baseConfidence: 0.93,
    patterns: [
      { regex: /\bchot don\b/, label: "chốt đơn" },
      { regex: /\bchot\b/, label: "chốt" },
      { regex: /\bdat hang\b/, label: "đặt hàng" },
      { regex: /\bship cho minh\b/, label: "ship cho mình" },
      { regex: /\blay 1 cai\b/, label: "lấy 1 cái" },
      { regex: /\blay 1\b/, label: "lấy 1" },
      { regex: /\blay \d+ cai\b/, label: "lấy N cái" },
      { regex: /\bdat \d+\b/, label: "đặt N" },
      { regex: /\bmuon mua \d+ cai\b/, label: "muốn mua N cái" },
      { regex: /\bminh mua\b/, label: "mình mua" },
      { regex: /\bmuon mua\b/, label: "muốn mua" },
      { regex: /\bmua\b/, label: "mua" },
    ],
  },
  {
    intent: "COMPARE_PRODUCTS",
    baseConfidence: 0.9,
    patterns: [
      { regex: /\bso sanh\b/, label: "so sánh" },
      { regex: /\bcompare\b/, label: "compare" },
      { regex: /\bkhac gi\b/, label: "khác gì" },
      { regex: /\bhang nao tot hon\b/, label: "hàng nào tốt hơn" },
      { regex: /\bcai nao re hon\b/, label: "cái nào rẻ hơn" },
      { regex: /\bkinh voi son\b/, label: "kính với son" },
    ],
  },
  {
    intent: "ASK_SHIPPING",
    baseConfidence: 0.88,
    patterns: [
      { regex: /\bship\b/, label: "ship" },
      { regex: /\bmien phi ship\b/, label: "miễn phí ship" },
      { regex: /\bfreeship\b/, label: "freeship" },
      { regex: /\bgiao hang\b/, label: "giao hàng" },
      { regex: /\bvan chuyen\b/, label: "vận chuyển" },
      { regex: /\bha noi\b/, label: "Hà Nội" },
      { regex: /\bho chi minh\b/, label: "TP.HCM" },
      { regex: /\bdanang\b/, label: "Đà Nẵng" },
    ],
  },
  {
    intent: "ASK_PROMOTION",
    baseConfidence: 0.88,
    patterns: [
      { regex: /\bgiam gia\b/, label: "giảm giá" },
      { regex: /\bkhuyen mai\b/, label: "khuyến mãi" },
      { regex: /\bsale\b/, label: "sale" },
      { regex: /\bflash sale\b/, label: "flash sale" },
      { regex: /\bco uu dai\b/, label: "có ưu đãi" },
    ],
  },
  {
    intent: "ASK_LINK",
    baseConfidence: 0.92,
    patterns: [
      { regex: /\bxin link\b/, label: "xin link" },
      { regex: /\blink dau\b/, label: "link đâu" },
      { regex: /\bcho link\b/, label: "cho link" },
      { regex: /\bgui link\b/, label: "gửi link" },
      { regex: /\blink\b/, label: "link" },
    ],
  },
  {
    intent: "ASK_STOCK",
    baseConfidence: 0.86,
    patterns: [
      { regex: /\bcon hang khong\b/, label: "còn hàng không" },
      { regex: /\bsize [smlx]{1,2} con khong\b/, label: "size còn không" },
      { regex: /\bcon hang\b/, label: "còn hàng" },
      { regex: /\bhet hang\b/, label: "hết hàng" },
      { regex: /\bton kho\b/, label: "tồn kho" },
      { regex: /\bcon bao nhieu\b/, label: "còn bao nhiêu" },
      { regex: /\bcon khong\b/, label: "còn không" },
      { regex: /\bco san\b/, label: "có sẵn" },
    ],
  },
  {
    intent: "ASK_SIZE",
    baseConfidence: 0.87,
    patterns: [
      { regex: /\bsize\b/, label: "size" },
      { regex: /\bco size\b/, label: "có size" },
      { regex: /\bcon size\b/, label: "còn size" },
      { regex: /\bsize [smlx]{1,2}\b/, label: "size cụ thể" },
    ],
  },
  {
    intent: "ASK_COLOR",
    baseConfidence: 0.9,
    patterns: [
      { regex: /\bcon mau\b/, label: "còn màu" },
      { regex: /\bco mau\b/, label: "có màu" },
      { regex: new RegExp(`\\bco mau (${COLOR_TOKENS})\\b`), label: "có màu cụ thể" },
      { regex: new RegExp(`\\bcon mau (${COLOR_TOKENS})\\b`), label: "còn màu cụ thể" },
      { regex: new RegExp(`\\bmau (${COLOR_TOKENS}) con khong\\b`), label: "màu X còn không" },
      { regex: /\bmau den\b/, label: "màu đen" },
      { regex: /\bmau do\b/, label: "màu đỏ" },
      { regex: /\bmau gi\b/, label: "màu gì" },
      { regex: /\bmau nao\b/, label: "màu nào" },
      { regex: /\bmau(?! nay\b)\b/, label: "màu" },
    ],
  },
  {
    intent: "ASK_PRODUCT_INFO",
    baseConfidence: 0.84,
    patterns: [
      { regex: /\bthong tin\b/, label: "thông tin" },
      { regex: /\bmo ta\b/, label: "mô tả" },
      { regex: /\bsan pham nay la gi\b/, label: "sản phẩm này là gì" },
      { regex: /\bco gi dac biet\b/, label: "có gì đặc biệt" },
    ],
  },
  {
    intent: "ASK_PRICE",
    baseConfidence: 0.95,
    patterns: [
      { regex: /^gia$/, label: "giá" },
      { regex: /\bgia bao nhieu\b/, label: "giá bao nhiêu" },
      { regex: /\bkinh nay bao nhieu\b/, label: "kính này bao nhiêu" },
      { regex: /\bbao nhieu tien\b/, label: "bao nhiêu tiền" },
      { regex: /\bnhieu tien\b/, label: "nhiu tiền" },
      { regex: /\bbao nhieu\b/, label: "bao nhiêu" },
      { regex: /\bgia\b/, label: "giá" },
    ],
  },
];

export type IntentClassification = {
  intent: SalesNlpIntent;
  confidence: number;
  matchedPatterns: string[];
};

function uniquePatterns(labels: string[]): string[] {
  return [...new Set(labels)];
}

export function classifyIntent(text: string): IntentClassification {
  if (!text) {
    return { intent: "UNKNOWN", confidence: 0, matchedPatterns: [] };
  }

  for (const rule of INTENT_RULES) {
    const matched = rule.patterns.filter(({ regex }) => regex.test(text)).map(({ label }) => label);
    if (matched.length === 0) {
      continue;
    }

    if (rule.intent === "ASK_STOCK" && /\bgia\b/.test(text)) {
      continue;
    }

    if (rule.intent === "ASK_SHIPPING" && /\b(con mau|mau den|mau do)\b/.test(text)) {
      continue;
    }

    const bonus = Math.min(0.04, Math.max(0, matched.length - 1) * 0.02);
    return {
      intent: rule.intent,
      confidence: Math.min(0.99, Number((rule.baseConfidence + bonus).toFixed(2))),
      matchedPatterns: uniquePatterns(matched),
    };
  }

  return { intent: "UNKNOWN", confidence: 0, matchedPatterns: [] };
}
