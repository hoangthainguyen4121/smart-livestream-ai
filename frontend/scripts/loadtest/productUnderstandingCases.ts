import type { HardCaseExpectation, HardTestCase, LoadTestContext } from "./hardCases";

export type ProductUnderstandingExpectation = HardCaseExpectation & {
  expectExactProduct?: boolean;
  expectClarification?: boolean;
  expectAmbiguous?: boolean;
  rejectPinnedFallback?: boolean;
  rejectRandomSelection?: boolean;
  allowAnyRecognizedIntent?: boolean;
};

export type ProductUnderstandingCase = HardTestCase & {
  expect?: ProductUnderstandingExpectation;
  productUnderstandingCategory?: "exact" | "ambiguous" | "category" | "conflict" | "deictic";
};

function add(
  cases: ProductUnderstandingCase[],
  input: Omit<ProductUnderstandingCase, "id">,
) {
  cases.push({
    ...input,
    id: `${input.group}-${cases.length + 1}`,
  });
}

export function buildProductUnderstandingCases(): ProductUnderstandingCase[] {
  const cases: ProductUnderstandingCase[] = [];

  add(cases, {
    group: "L-exact",
    comment: "son ruby đỏ giá bao nhiêu",
    productUnderstandingCategory: "exact",
    expect: {
      intent: "ASK_PRICE",
      productId: "lipstick-ruby",
      expectExactProduct: true,
      rejectPinnedFallback: true,
    },
  });
  add(cases, {
    group: "L-exact",
    comment: "son ruby cam còn hàng không",
    productUnderstandingCategory: "exact",
    expect: {
      intent: "ASK_STOCK",
      productId: "lipstick-ruby-cam",
      expectExactProduct: true,
      rejectPinnedFallback: true,
    },
  });
  add(cases, {
    group: "L-exact",
    comment: "son ruby matte có màu gì",
    productUnderstandingCategory: "exact",
    expect: {
      intent: "ASK_COLOR",
      productId: "lipstick-ruby-matte",
      expectExactProduct: true,
      rejectPinnedFallback: true,
    },
  });

  add(cases, {
    group: "L-ambiguous",
    comment: "son ruby giá sao",
    productUnderstandingCategory: "ambiguous",
    expect: {
      intent: "ASK_PRICE",
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });
  add(cases, {
    group: "L-ambiguous",
    comment: "son ruby còn không",
    productUnderstandingCategory: "ambiguous",
    expect: {
      intent: "ASK_STOCK",
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });
  add(cases, {
    group: "L-ambiguous",
    comment: "son ruby loại nào đẹp",
    productUnderstandingCategory: "ambiguous",
    expect: {
      allowAnyRecognizedIntent: true,
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });

  add(cases, {
    group: "L-category",
    comment: "có mấy loại son",
    productUnderstandingCategory: "category",
    expect: {
      rejectPinnedFallback: true,
      expectClarification: true,
      allowAnyRecognizedIntent: true,
    },
  });
  add(cases, {
    group: "L-category",
    comment: "shop có những loại son nào",
    productUnderstandingCategory: "category",
    expect: {
      rejectPinnedFallback: true,
      allowAnyRecognizedIntent: true,
    },
  });
  add(cases, {
    group: "L-category",
    comment: "son nào rẻ nhất",
    productUnderstandingCategory: "category",
    expect: {
      rejectPinnedFallback: true,
      rejectRandomSelection: true,
      allowAnyRecognizedIntent: true,
    },
  });
  add(cases, {
    group: "L-category",
    comment: "son nào còn hàng",
    productUnderstandingCategory: "category",
    expect: {
      rejectPinnedFallback: true,
      rejectRandomSelection: true,
      allowAnyRecognizedIntent: true,
    },
  });

  add(cases, {
    group: "L-conflict",
    comment: "son đỏ giá bao nhiêu",
    productUnderstandingCategory: "conflict",
    expect: {
      intent: "ASK_PRICE",
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });
  add(cases, {
    group: "L-conflict",
    comment: "son mini còn hàng không",
    productUnderstandingCategory: "conflict",
    expect: {
      intent: "ASK_STOCK",
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });
  add(cases, {
    group: "L-conflict",
    comment: "son matte giá sao",
    productUnderstandingCategory: "conflict",
    expect: {
      intent: "ASK_PRICE",
      expectClarification: true,
      rejectRandomSelection: true,
    },
  });

  const deicticComments = [
    { comment: "cái này giá bao nhiêu", intent: "ASK_PRICE" as const },
    { comment: "em này còn không", intent: "ASK_STOCK" as const },
  ];

  const deicticScenarios: Array<{
    scenario: string;
    context: LoadTestContext;
    expect: ProductUnderstandingExpectation;
  }> = [
    {
      scenario: "no-pin",
      context: { label: "no-pin", pinnedProductId: "lipstick-ruby" },
      expect: { expectClarification: true, intent: "ASK_PRICE" },
    },
    {
      scenario: "pinned",
      context: { label: "pinned", pinnedProductId: "lipstick-ruby" },
      expect: {
        contextSource: "pinned_product",
        productId: "lipstick-ruby",
        rejectPinnedFallback: false,
      },
    },
    {
      scenario: "manual",
      context: {
        label: "manual-camera",
        pinnedProductId: "lipstick-ruby-cam",
        selectedCameraProductId: "lipstick-ruby-matte",
      },
      expect: {
        contextSource: "manual_camera_context",
        productId: "lipstick-ruby-matte",
      },
    },
  ];

  for (const { comment, intent } of deicticComments) {
    for (const scenario of deicticScenarios) {
      add(cases, {
        group: "L-deictic",
        comment,
        scenario: scenario.scenario,
        context: scenario.context,
        productUnderstandingCategory: "deictic",
        expect: {
          ...scenario.expect,
          intent:
            scenario.scenario === "no-pin"
              ? intent
              : (scenario.expect.intent ?? intent),
        },
      });
    }
  }

  add(cases, {
    group: "L-deictic",
    comment: "son ruby đỏ giá bao nhiêu",
    scenario: "explicit-overrides-pinned",
    context: { label: "pinned", pinnedProductId: "lipstick-ruby-cam" },
    productUnderstandingCategory: "deictic",
    expect: {
      intent: "ASK_PRICE",
      productId: "lipstick-ruby",
      expectExactProduct: true,
    },
  });

  return cases;
}
