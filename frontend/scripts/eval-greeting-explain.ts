#!/usr/bin/env node
import { buildMlIntentBridge } from "../src/features/sales-nlp/mlIntentBridge";
import { classifyIntent } from "../src/features/sales-nlp/intentClassifier";
import { normalizeText } from "../src/features/sales-nlp/normalizeText";
import { runSalesNlpPipeline } from "../src/features/sales-nlp/salesNlpPipeline";
import { getAllProducts, getDefaultPinnedProduct } from "../src/features/product-catalog";

const GREETING_CASES = [
  { comment: "chào buổi tối", mlIntent: "PURCHASE_INTENT", mlConfidence: 0.78 },
  { comment: "chào buổi sáng", mlIntent: "PURCHASE_INTENT", mlConfidence: 0.89 },
  { comment: "chao buoi toi", mlIntent: "PURCHASE_INTENT", mlConfidence: 0.78 },
  { comment: "xin chào", mlIntent: "CHITCHAT", mlConfidence: 0.62 },
  { comment: "shop ơi", mlIntent: "PURCHASE_INTENT", mlConfidence: 0.71 },
];

const pinnedProduct = getDefaultPinnedProduct();
const catalog = getAllProducts();

for (const testCase of GREETING_CASES) {
  const normalizedText = normalizeText(testCase.comment);
  const regexClassification = classifyIntent(normalizedText);
  const mlBridge = buildMlIntentBridge(
    {
      ml_available: true,
      intent: testCase.mlIntent,
      confidence: testCase.mlConfidence,
    },
    regexClassification,
    normalizedText,
  );
  const result = runSalesNlpPipeline({
    comment: testCase.comment,
    pinnedProduct,
    catalog,
    autoReplyInChat: true,
    mlBridge,
  });

  console.log("\n===", testCase.comment, "===");
  console.log(JSON.stringify(result.explanation, null, 2));
}
