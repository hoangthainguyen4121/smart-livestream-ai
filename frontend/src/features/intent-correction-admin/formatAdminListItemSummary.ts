import type { IntentCorrectionListItem } from "../../api/adminIntentCorrections";

export function formatAdminListItemSummary(item: IntentCorrectionListItem): string {
  return `${item.source_author_display_name}: ${item.source_comment_text} | ${item.predicted_intent} -> ${item.proposed_intent}`;
}
