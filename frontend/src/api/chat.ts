import type { CommerceSuggestedAction } from "../features/commerce/commerceTypes";
import { getWebSocketBaseUrl } from "./config";

export type ChatMessage = {
  id: string;
  room_id: string;
  author: string;
  text: string;
  created_at: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
  replyToText?: string;
  commerceActions?: CommerceSuggestedAction[];
};

export type ChatHistoryEvent = {
  type: "chat_history";
  room_id: string;
  messages: ChatMessage[];
};

export type ChatMessageEvent = ChatMessage & {
  type: "chat_message";
};

export type ChatErrorEvent = {
  type: "error";
  message: string;
};

export type ChatEvent = ChatHistoryEvent | ChatMessageEvent | ChatErrorEvent;

export type OutgoingChatMessage = {
  type: "chat_message";
  author: string;
  text: string;
};

export type OutgoingAssistantChatMessage = {
  type: "chat_message";
  id: string;
  author: string;
  text: string;
  reply_to_message_id: string;
  reply_to_author: string;
  reply_to_text: string;
  commerce_actions?: Array<{
    id: string;
    type: string;
    label: string;
    product_id?: string;
    quantity?: number;
    color?: string | null;
    size?: string | null;
  }>;
};

export function createChatSocket(roomId: string) {
  return new WebSocket(`${getWebSocketBaseUrl()}/ws/chat/${encodeURIComponent(roomId)}`);
}

export function createOutgoingChatMessage(author: string, text: string): OutgoingChatMessage {
  return {
    type: "chat_message",
    author,
    text,
  };
}

function parseCommerceActions(value: unknown): CommerceSuggestedAction[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const actions: CommerceSuggestedAction[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : null;
    const type = typeof raw.type === "string" ? raw.type : null;
    const label = typeof raw.label === "string" ? raw.label : null;
    if (!id || !type || !label) {
      continue;
    }

    if (type !== "add_to_cart" && type !== "open_checkout" && type !== "open_cart") {
      continue;
    }

    actions.push({
      id,
      type,
      label,
      productId: typeof raw.product_id === "string" ? raw.product_id : undefined,
      quantity: typeof raw.quantity === "number" ? raw.quantity : undefined,
      color: typeof raw.color === "string" ? raw.color : raw.color === null ? null : undefined,
      size: typeof raw.size === "string" ? raw.size : raw.size === null ? null : undefined,
    });
  }

  return actions.length > 0 ? actions : undefined;
}

export function normalizeChatMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: String(raw.id),
    room_id: String(raw.room_id),
    author: String(raw.author),
    text: String(raw.text),
    created_at: String(raw.created_at),
    replyToMessageId:
      typeof raw.reply_to_message_id === "string" ? raw.reply_to_message_id : undefined,
    replyToAuthor: typeof raw.reply_to_author === "string" ? raw.reply_to_author : undefined,
    replyToText: typeof raw.reply_to_text === "string" ? raw.reply_to_text : undefined,
    commerceActions: parseCommerceActions(raw.commerce_actions),
  };
}

export function createOutgoingAssistantChatMessage(message: ChatMessage): OutgoingAssistantChatMessage {
  if (!message.replyToMessageId || !message.replyToAuthor || !message.replyToText) {
    throw new Error("Assistant chat messages require reply metadata.");
  }

  const payload: OutgoingAssistantChatMessage = {
    type: "chat_message",
    id: message.id,
    author: message.author,
    text: message.text,
    reply_to_message_id: message.replyToMessageId,
    reply_to_author: message.replyToAuthor,
    reply_to_text: message.replyToText,
  };

  if (message.commerceActions && message.commerceActions.length > 0) {
    payload.commerce_actions = message.commerceActions.map((action) => ({
      id: action.id,
      type: action.type,
      label: action.label,
      product_id: action.productId,
      quantity: action.quantity,
      color: action.color,
      size: action.size,
    }));
  }

  return payload;
}

export function appendUniqueChatMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }

  return [...messages, incoming];
}
