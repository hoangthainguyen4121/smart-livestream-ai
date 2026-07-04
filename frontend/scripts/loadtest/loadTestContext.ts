import type { CatalogProduct } from "../../src/features/product-catalog/productCatalogTypes";
import type { LoadTestRunContextMode } from "./cliArgs";
import type { HardTestCase, LoadTestContext } from "./hardCases";

export const NO_PIN_PRODUCT_ID = "__no_pin__";

export type LoadTestContextOptions = {
  runContextMode: LoadTestRunContextMode;
  disablePinnedFallback: boolean;
  fallbackProductId: string;
  cameraProductId: string;
  visionConfidence: number;
};

export function shouldDisablePinnedFallback(options: LoadTestContextOptions): boolean {
  return options.disablePinnedFallback || options.runContextMode === "no-pin";
}

export function buildNoPinProduct(template: CatalogProduct): CatalogProduct {
  return {
    ...template,
    id: NO_PIN_PRODUCT_ID,
    name: "Không ghim",
  };
}

export function resolveRuntimeContext(
  testCase: HardTestCase | undefined,
  options: LoadTestContextOptions,
): LoadTestContext | undefined {
  const scenarioLabels = new Set([
    "pinned",
    "manual-camera",
    "vision-enabled",
    "vision-disabled",
    "no-pin",
    "no-context",
  ]);

  if (testCase?.context?.label && scenarioLabels.has(testCase.context.label)) {
    return testCase.context;
  }

  if (options.runContextMode === "mixed") {
    return testCase?.context;
  }

  const pinnedProductId = options.fallbackProductId;

  switch (options.runContextMode) {
    case "no-pin":
      return {
        label: "no-pin",
        pinnedProductId,
        selectedCameraProductId: null,
        detectedCameraProductId: null,
      };
    case "manual":
      return {
        label: "manual-camera",
        pinnedProductId,
        selectedCameraProductId: options.cameraProductId,
      };
    case "pinned":
    default:
      return { label: "pinned", pinnedProductId };
  }
}

export function resolvePinnedProductForRun(
  catalog: CatalogProduct[],
  findProduct: (catalog: CatalogProduct[], productId: string) => CatalogProduct,
  context: LoadTestContext | undefined,
  options: LoadTestContextOptions,
): CatalogProduct {
  const templateId = context?.pinnedProductId ?? options.fallbackProductId;
  const template = findProduct(catalog, templateId);

  const allowsPinnedScenario =
    context?.label === "pinned" ||
    context?.label === "manual-camera" ||
    context?.label === "vision-enabled" ||
    context?.label === "vision-disabled";

  const noPin =
    (context?.label === "no-context" || context?.label === "no-pin") ||
    (shouldDisablePinnedFallback(options) && !allowsPinnedScenario);

  if (noPin) {
    return buildNoPinProduct(template);
  }

  const pinnedId = context?.pinnedProductId ?? options.fallbackProductId;
  return findProduct(catalog, pinnedId);
}
