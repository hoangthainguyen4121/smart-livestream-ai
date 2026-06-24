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
