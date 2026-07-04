import { hasColorVariantQuestion, hasSizeVariantQuestion } from "./intentSignals";

/** Purchase / order action verbs (normalized text, word-boundary). */
const PURCHASE_ACTION_PATTERN =
  /\b(chot don|chot|dat hang|dat \d+|lay \d+|mua|muon mua|minh mua|order|thanh toan)\b/;

/** Complaint / dispute signals — not product-name tokens. */
const COMPLAINT_SIGNAL_PATTERN =
  /\b(lua dao|giao sai|giao nham|khong giong|be hang|lag|scam|khiu nai|to cao|that vong|hen|din vao|hang loi|hang gia|bi hu|refund|doi tra)\b/;

/** Spam / off-platform solicitation (structural). */
const SPAM_SIGNAL_PATTERN =
  /\b(ib zalo|vao link|nhan qua free|add zalo|click link)\b/;

const PRICE_SIGNAL_PATTERN = /\b(gia bao nhieu|bao nhieu|bn|tien|gia)\b/;
const STOCK_SIGNAL_PATTERN = /\b(con hang|het hang|con khong|co san|ton kho|con k)\b/;
const LINK_SIGNAL_PATTERN = /\b(link|xin link|cho link)\b/;
const SHIPPING_SIGNAL_PATTERN = /\b(ship|giao hang|van chuyen|freeship)\b/;
const PROMOTION_SIGNAL_PATTERN = /\b(khuyen mai|giam gia|sale|uu dai)\b/;

export function hasPurchaseActionVerb(normalizedText: string): boolean {
  return PURCHASE_ACTION_PATTERN.test(normalizedText);
}

export function hasComplaintOrSpamSignal(normalizedText: string): boolean {
  return COMPLAINT_SIGNAL_PATTERN.test(normalizedText) || SPAM_SIGNAL_PATTERN.test(normalizedText);
}

export function hasCommerceQuestionSignal(normalizedText: string): boolean {
  if (PRICE_SIGNAL_PATTERN.test(normalizedText)) {
    return true;
  }
  if (STOCK_SIGNAL_PATTERN.test(normalizedText)) {
    return true;
  }
  if (LINK_SIGNAL_PATTERN.test(normalizedText)) {
    return true;
  }
  if (SHIPPING_SIGNAL_PATTERN.test(normalizedText)) {
    return true;
  }
  if (PROMOTION_SIGNAL_PATTERN.test(normalizedText)) {
    return true;
  }
  if (hasColorVariantQuestion(normalizedText) || hasSizeVariantQuestion(normalizedText)) {
    return true;
  }
  if (/\bco may loai\b|\bmay loai\b|\bloai nao\b/.test(normalizedText)) {
    return true;
  }
  return false;
}
