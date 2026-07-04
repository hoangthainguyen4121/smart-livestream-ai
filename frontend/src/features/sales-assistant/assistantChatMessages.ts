import type { ChatMessage } from "../../api/chat";
import type { SalesAssistantEvent } from "./salesAssistantTypes";
import { AI_SALES_ASSISTANT_ACTOR } from "./salesAssistantTypes";

export function buildAssistantChatMessage(
  event: SalesAssistantEvent,
  triggerMessage: Pick<ChatMessage, "id" | "author" | "text" | "room_id">,
): ChatMessage {
  return {
    id: `assistant-${triggerMessage.id}`,
    room_id: triggerMessage.room_id,
    author: AI_SALES_ASSISTANT_ACTOR,
    text: event.suggestedReply,
    created_at: event.createdAt,
    replyToMessageId: triggerMessage.id,
    replyToAuthor: triggerMessage.author,
    replyToText: triggerMessage.text,
    commerceActions:
      event.commerceActions.length > 0 ? [...event.commerceActions] : undefined,
  };
}

export function mergeChatWithAssistantReplies(
  messages: ChatMessage[],
  assistantRepliesByTriggerId: Record<string, ChatMessage>,
): ChatMessage[] {
  const merged: ChatMessage[] = [];
  const insertedReplyIds = new Set<string>();

  for (const message of messages) {
    merged.push(message);

    const reply = assistantRepliesByTriggerId[message.id];
    if (!reply || insertedReplyIds.has(reply.id)) {
      continue;
    }

    merged.push(reply);
    insertedReplyIds.add(reply.id);
  }

  return merged;
}

export function isAssistantChatMessage(message: ChatMessage): boolean {
  return message.author === AI_SALES_ASSISTANT_ACTOR && Boolean(message.replyToMessageId);
}
