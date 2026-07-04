import type { ExplainableContextSource } from "../../src/features/sales-nlp/salesNlpTypes";
import type { SalesNlpAction, SalesNlpIntent } from "../../src/features/sales-nlp/salesNlpTypes";

export type LoadTestContext = {
  pinnedProductId?: string;
  selectedCameraProductId?: string | null;
  detectedCameraProductId?: string | null;
  detectedCameraConfidence?: number | null;
  label?: string;
};

export type HardCaseExpectation = {
  intent?: SalesNlpIntent;
  contextSource?: ExplainableContextSource;
  productId?: string;
  action?: SalesNlpAction;
  requiresMl?: boolean;
  allowAmbiguous?: boolean;
};

export type HardTestCase = {
  id: string;
  group: string;
  comment: string;
  context?: LoadTestContext;
  expect?: HardCaseExpectation;
  scenario?: string;
};

const SLANG_VARIANTS = [
  "giá bn",
  "bn shop",
  "nhiêu z",
  "nhiu tiền",
  "còn k",
  "con ko",
  "còn hông",
  "size m còn k",
  "ship sg dc k",
  "freeship k",
  "ib giá",
  "chốt",
  "lấy 1",
  "để em 1 cái",
  "gửi link",
  "xin link",
  "màu nào",
  "có màu đen k",
];

const DEICTIC_PHRASES = [
  "cái này",
  "món này",
  "em này",
  "cái đang đeo",
  "cái vừa nói",
  "mẫu này",
  "sản phẩm này",
];

const INTENT_TEMPLATES: Record<string, string[]> = {
  ASK_PRICE: [
    "giá bao nhiêu",
    "giá {product} bn",
    "bn shop",
    "nhiu tiền {product}",
    "ib giá",
    "{deictic} giá sao",
    "{product} giá nhiêu z",
  ],
  ASK_STOCK: [
    "còn hàng không",
    "còn k",
    "con ko",
    "còn hông",
    "{product} còn không",
    "{deictic} còn hàng không",
    "size m còn k",
  ],
  ASK_VARIANT: [
    "màu nào",
    "có màu đen k",
    "co size m ko",
    "{deictic} màu gì",
    "mau den con khong",
  ],
  ASK_LINK: ["xin link", "gửi link", "link {product} đâu", "cho em link"],
  ASK_SHIPPING: ["ship hcm không", "ship sg dc k", "freeship k", "giao hàng mấy ngày"],
  ASK_PROMOTION: ["có sale không", "giảm giá không shop", "khuyến mãi gì"],
  PURCHASE_INTENT: ["chốt", "lấy 1", "để em 1 cái", "chốt 1 cái màu đỏ"],
  PRODUCT_INFO: ["{product} là gì", "sp này có gì đặc biệt", "{deictic} thông tin"],
  COMPLAINT: ["hàng giao lỗi", "shop giao sai màu", "sao chưa nhận được hàng"],
  CHITCHAT: ["shop ui qua", "ngon đấy", "live hay quá"],
  SPAM_TOXIC: ["vào link này nhận quà", "lừa đảo à", "scam shop"],
};

const EXPLICIT_PRODUCTS = [
  { phrase: "son ruby đỏ", id: "lipstick-ruby" },
  { phrase: "kính thời trang A", id: "glasses-a" },
  { phrase: "áo thun basic trắng", id: "shirt-basic-white" },
  { phrase: "túi mini đen", id: "bag-mini-black" },
  { phrase: "đồng hồ dây da", id: "watch-leather" },
];

const RANDOM_PRODUCT_SNIPPETS = [
  "kính thời trang A",
  "son ruby",
  "son ruby đỏ",
  "áo basic",
  "áo thun basic trắng",
  "túi mini",
  "túi đeo chéo",
  "serum",
  "giày sneaker",
  "đồng hồ dây da",
];

const NOISE_TRANSFORMS: Array<(value: string, index: number) => string> = [
  (value) => value,
  (value) => value.replace(/\?/g, "???"),
  (value) => value.replace(/!/g, ""),
  (value) => value.replace(/\s+/g, "  "),
  (value) => value.replace(/(.)\1{2,}/g, "$1$1"),
  (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  (value) => value.toLowerCase(),
  (value) => `${value} shop oi`,
  (value) => value.replace(/,/g, " , "),
];

function hashMix(seed: number, index: number): number {
  return (seed ^ (index * 2_654_435_761)) >>> 0;
}

function fillTemplate(template: string, index: number): string {
  const product = RANDOM_PRODUCT_SNIPPETS[index % RANDOM_PRODUCT_SNIPPETS.length];
  const deictic = DEICTIC_PHRASES[index % DEICTIC_PHRASES.length];
  return template.replace("{product}", product).replace("{deictic}", deictic);
}

function applyNoise(comment: string, index: number, seed: number): string {
  const transform = NOISE_TRANSFORMS[hashMix(seed, index) % NOISE_TRANSFORMS.length];
  return transform(comment, index);
}

const SCENARIO_MATRIX: Array<{
  scenario: string;
  context: LoadTestContext;
  expect: (comment: string) => HardCaseExpectation;
}> = [
  {
    scenario: "no-context",
    context: {
      label: "no-context",
      pinnedProductId: "glasses-a",
      selectedCameraProductId: null,
      detectedCameraProductId: null,
    },
    expect: () => ({ contextSource: "clarification", action: "AUTO_REPLY_SUGGESTED" }),
  },
  {
    scenario: "pinned",
    context: { label: "pinned", pinnedProductId: "glasses-a" },
    expect: () => ({ contextSource: "pinned_product" }),
  },
  {
    scenario: "manual-camera",
    context: {
      label: "manual-camera",
      pinnedProductId: "glasses-a",
      selectedCameraProductId: "lipstick-ruby",
    },
    expect: () => ({ contextSource: "manual_camera_context", productId: "lipstick-ruby" }),
  },
  {
    scenario: "vision-disabled",
    context: {
      label: "vision-disabled",
      pinnedProductId: "glasses-a",
      detectedCameraProductId: "lipstick-ruby",
      detectedCameraConfidence: 0.2,
    },
    expect: () => ({ contextSource: "pinned_product" }),
  },
  {
    scenario: "vision-enabled",
    context: {
      label: "vision-enabled",
      pinnedProductId: "glasses-a",
      detectedCameraProductId: "lipstick-ruby",
      detectedCameraConfidence: 0.82,
    },
    expect: () => ({ contextSource: "camera_vision", productId: "lipstick-ruby" }),
  },
];

export function buildHardTestCases(): HardTestCase[] {
  const cases: HardTestCase[] = [];
  let counter = 0;

  const add = (
    group: string,
    comment: string,
    expect?: HardCaseExpectation,
    context?: LoadTestContext,
    scenario?: string,
  ) => {
    counter += 1;
    cases.push({
      id: `${group}-${counter}`,
      group,
      comment,
      context,
      expect,
      scenario,
    });
  };

  add("A-clear", "giá bao nhiêu", { intent: "ASK_PRICE", contextSource: "clarification" });
  add("A-clear", "còn hàng không", { intent: "ASK_STOCK", contextSource: "clarification" });
  add("A-clear", "xin link", { intent: "ASK_LINK", contextSource: "clarification" });
  add("A-clear", "ship hcm không", { intent: "ASK_SHIPPING", contextSource: "clarification" });
  add("A-clear", "chốt 1 cái", {
    intent: "PURCHASE_INTENT",
    action: "ESCALATE_TO_HOST",
    contextSource: "clarification",
  });

  for (const slang of SLANG_VARIANTS) {
    const expect: HardCaseExpectation = {};
    if (/giá|bn|nhiu|ib gia/i.test(slang)) {
      expect.intent = "ASK_PRICE";
    } else if (/còn|con ko|con k|hông/i.test(slang)) {
      expect.intent = "ASK_STOCK";
    } else if (/size m còn/i.test(slang)) {
      expect.intent = "ASK_STOCK";
    } else if (/ship|freeship/i.test(slang)) {
      expect.intent = "ASK_SHIPPING";
    } else if (/link/i.test(slang)) {
      expect.intent = "ASK_LINK";
    } else if (/màu|mau/i.test(slang)) {
      expect.intent = "ASK_COLOR";
    } else if (/chốt|lấy|để em/i.test(slang)) {
      expect.intent = "PURCHASE_INTENT";
      expect.action = "ESCALATE_TO_HOST";
    }
    add("B-slang", slang, Object.keys(expect).length > 0 ? expect : undefined);
  }

  const pinnedDeicticContext: LoadTestContext = {
    label: "pinned",
    pinnedProductId: "glasses-a",
  };

  for (const deictic of DEICTIC_PHRASES) {
    add(
      "C-deictic",
      `${deictic} giá sao`,
      { intent: "ASK_PRICE", contextSource: "pinned_product" },
      pinnedDeicticContext,
      "pinned",
    );
    add(
      "C-deictic",
      `${deictic} còn không`,
      { intent: "ASK_STOCK", contextSource: "pinned_product" },
      pinnedDeicticContext,
      "pinned",
    );
    add(
      "C-deictic",
      `${deictic} màu gì`,
      { intent: "ASK_COLOR", contextSource: "pinned_product" },
      pinnedDeicticContext,
      "pinned",
    );
  }

  for (const product of EXPLICIT_PRODUCTS) {
    add("D-explicit", `${product.phrase} giá bao nhiêu`, {
      intent: "ASK_PRICE",
      contextSource: "explicit_catalog_match",
      productId: product.id,
    });
    add("D-explicit", `${product.phrase} còn hàng không`, {
      intent: "ASK_STOCK",
      contextSource: "explicit_catalog_match",
      productId: product.id,
    });
  }

  add("D-explicit", "áo thun basic trắng size m còn không", {
    intent: "ASK_STOCK",
    contextSource: "explicit_catalog_match",
    productId: "shirt-basic-white",
  });

  add("E-ambiguous", "son ruby giá sao", {
    intent: "ASK_PRICE",
    contextSource: "clarification",
    allowAmbiguous: true,
  });
  add("E-ambiguous", "kính thời trang còn không", {
    intent: "ASK_STOCK",
    contextSource: "clarification",
    allowAmbiguous: true,
  });
  add("E-ambiguous", "áo basic giá nhiêu", {
    intent: "ASK_PRICE",
    contextSource: "clarification",
    allowAmbiguous: true,
  });
  add("E-ambiguous", "túi mini còn không", {
    intent: "ASK_STOCK",
    contextSource: "clarification",
    allowAmbiguous: true,
  });

  add("F-multi", "giá bao nhiêu còn hàng không", { intent: "ASK_PRICE" });
  add("F-multi", "còn màu đen không, ship hcm mấy ngày", { intent: "ASK_COLOR" });
  add("F-multi", "chốt 1 cái màu đỏ còn hàng không", {
    intent: "PURCHASE_INTENT",
    action: "ESCALATE_TO_HOST",
  });

  add("G-noise", "ngon đấy", { intent: "UNKNOWN", action: "IGNORE" });
  add("G-noise", "shop đẹp quá", { intent: "UNKNOWN", action: "IGNORE" });
  add("G-noise", "abc xyz", { intent: "UNKNOWN", action: "IGNORE" });
  add("G-noise", "vào link này nhận quà", { intent: "UNKNOWN", action: "IGNORE", requiresMl: true });
  add("G-noise", "lừa đảo à", { action: "ESCALATE_TO_HOST" });
  add("G-noise", "không giống hình", { action: "ESCALATE_TO_HOST" });

  add("I-manual-ui", "son", { contextSource: "clarification" });
  add("I-manual-ui", "sản phẩm ghim", { contextSource: "pinned_product" });
  add("I-manual-ui", "em này", { contextSource: "pinned_product" }, { label: "pinned", pinnedProductId: "glasses-a" }, "pinned");
  add("I-manual-ui", "sp này", { contextSource: "pinned_product" }, { label: "pinned", pinnedProductId: "glasses-a" }, "pinned");
  add("I-manual-ui", "có mấy loại áo", { contextSource: "clarification" });
  add("I-manual-ui", "shop bán kính gì", { contextSource: "clarification" });
  add("I-manual-ui", "shop có mấy loại son", { contextSource: "clarification" });
  add("I-manual-ui", "Kính thời trang A màu gì", {
    intent: "ASK_COLOR",
    contextSource: "explicit_catalog_match",
    productId: "glasses-a",
  });
  add("I-manual-ui", "chốt", { intent: "PURCHASE_INTENT", action: "ESCALATE_TO_HOST", contextSource: "clarification" });
  add("I-manual-ui", "lấy 1", { intent: "PURCHASE_INTENT", action: "ESCALATE_TO_HOST", contextSource: "clarification" });
  add("I-manual-ui", "đặt 1", { intent: "PURCHASE_INTENT", action: "ESCALATE_TO_HOST", contextSource: "clarification" });

  for (const template of INTENT_TEMPLATES.COMPLAINT) {
    add("H-complaint", template, { requiresMl: true });
  }

  for (const template of INTENT_TEMPLATES.SPAM_TOXIC) {
    add("H-spam", template, { requiresMl: true });
  }

  for (const template of INTENT_TEMPLATES.CHITCHAT) {
    add("G-chitchat", template, { intent: "UNKNOWN", action: "IGNORE" });
  }

  const matrixComments = [
    { comment: "cái này giá bn", intent: "ASK_PRICE" as SalesNlpIntent },
    { comment: "món này còn không", intent: "ASK_STOCK" as SalesNlpIntent },
    { comment: "em này màu gì", intent: "ASK_COLOR" as SalesNlpIntent },
    { comment: "mẫu này còn hàng không", intent: "ASK_STOCK" as SalesNlpIntent },
    { comment: "sản phẩm này giá sao", intent: "ASK_PRICE" as SalesNlpIntent },
  ];

  for (const { comment, intent } of matrixComments) {
    for (const scenario of SCENARIO_MATRIX) {
      const baseExpect = scenario.expect(comment);
      add(
        `I-matrix-${scenario.scenario}`,
        comment,
        scenario.scenario === "no-context" ? baseExpect : { ...baseExpect, intent },
        scenario.context,
        scenario.scenario,
      );
    }
  }

  add("I-explicit", "son ruby đỏ giá bao nhiêu", {
    intent: "ASK_PRICE",
    contextSource: "explicit_catalog_match",
    productId: "lipstick-ruby",
  });

  return cases;
}

export function buildRandomComments(count: number, seed = 42): string[] {
  const flatTemplates = Object.values(INTENT_TEMPLATES).flat();
  const comments: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const template = flatTemplates[hashMix(seed, index) % flatTemplates.length];
    const filled = fillTemplate(template, index);
    comments.push(applyNoise(filled, index, seed));
  }

  return comments;
}

export function isDeterministicGroup(group: string): boolean {
  return !group.startsWith("R-random");
}
