import type { SalesNlpAction, SalesNlpIntent } from "./salesNlpTypes";

export function decideAction(
  intent: SalesNlpIntent,
  autoReplyInChat: boolean,
): SalesNlpAction {
  if (intent === "UNKNOWN") {
    return "IGNORE";
  }

  if (intent === "PURCHASE_INTENT") {
    return "ESCALATE_TO_HOST";
  }

  if (intent === "ASK_SHIPPING" || intent === "ASK_PROMOTION" || intent === "COMPARE_PRODUCTS") {
    return autoReplyInChat ? "AUTO_REPLY_SUGGESTED" : "INBOX_SUGGESTED";
  }

  return autoReplyInChat ? "AUTO_REPLY_SUGGESTED" : "INBOX_SUGGESTED";
}

export function shouldReplyInChat(action: SalesNlpAction): boolean {
  return action === "AUTO_REPLY_SUGGESTED" || action === "ESCALATE_TO_HOST";
}
