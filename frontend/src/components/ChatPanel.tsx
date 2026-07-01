import { useEffect, useRef, useState } from "react";

import {
  createChatSocket,
  createOutgoingChatMessage,
  type ChatEvent,
  type ChatMessage,
} from "../api/chat";
import {
  isAssistantChatMessage,
  mergeChatWithAssistantReplies,
} from "../features/sales-assistant/assistantChatMessages";
import type { ChatMlIntentBadge } from "../features/sales-nlp/mlIntentBridge";


type ChatPanelProps = {
  roomId: string;
  author: string;
  initialMessages: ChatMessage[];
  assistantRepliesByTriggerId?: Record<string, ChatMessage>;
  mlIntentBadgesByMessageId?: Record<string, ChatMlIntentBadge>;
  onViewerMessageSent?: (message: {
    messageId: string;
    author: string;
    text: string;
  }) => void;
};


export function ChatPanel({
  roomId,
  author,
  initialMessages,
  assistantRepliesByTriggerId = {},
  mlIntentBadgesByMessageId = {},
  onViewerMessageSent,
}: ChatPanelProps) {
  const socketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const displayNameRef = useRef(author);
  const onViewerMessageSentRef = useRef(onViewerMessageSent);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [displayName, setDisplayName] = useState(author);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  displayNameRef.current = displayName;
  onViewerMessageSentRef.current = onViewerMessageSent;

  useEffect(() => {
    const socket = createChatSocket(roomId);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      setErrorMessage(null);
    };
    socket.onclose = () => setStatus("disconnected");
    socket.onerror = () => {
      setStatus("error");
      setErrorMessage(
        "Không kết nối được chat. Kiểm tra backend đang chạy tại cổng 8000.",
      );
    };
    socket.onmessage = (event) => {
      try {
        handleChatEvent(JSON.parse(event.data) as ChatEvent);
      } catch {
        setErrorMessage("Unable to read chat message.");
      }
    };

    return () => {
      socket.close();
    };
  }, [roomId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
    });
  }, [messages, assistantRepliesByTriggerId]);

  const visibleMessages = mergeChatWithAssistantReplies(
    messages,
    assistantRepliesByTriggerId,
  );

  function handleChatEvent(event: ChatEvent) {
    if (event.type === "chat_history") {
      setMessages(event.messages.length > 0 ? event.messages : initialMessages);
      return;
    }

    if (event.type === "chat_message") {
      setMessages((currentMessages) => [...currentMessages, event]);

      if (event.author === displayNameRef.current.trim()) {
        onViewerMessageSentRef.current?.({
          messageId: event.id,
          author: event.author,
          text: event.text,
        });
      }
      return;
    }

    setErrorMessage(event.message);
  }

  function handleSendChatMessage() {
    const text = input.trim();
    const sender = displayName.trim();
    const socket = socketRef.current;

    if (!text || !sender || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(createOutgoingChatMessage(sender, text)));
    setInput("");
  }

  return (
    <aside className="chatPanel">
      <div className="chatHeader">
        <div>
          <h2>Live Chat</h2>
          <span>{visibleMessages.length} messages</span>
        </div>
        <span className={`status ${status}`}>WS: {status}</span>
      </div>
      <label className="chatDisplayName">
        <span>Display name</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={32}
          placeholder="Display name"
        />
      </label>
      <div className="chatMessages" ref={messagesRef}>
        {visibleMessages.map((message) => (
          <div
            className={
              isAssistantChatMessage(message)
                ? "chatMessage chatMessageAssistant"
                : "chatMessage"
            }
            key={message.id}
          >
            {isAssistantChatMessage(message) ? (
              <>
                <strong>{message.author}</strong>
                <span className="chatReplyContext">
                  Replying to {message.replyToAuthor}: {message.replyToText}
                </span>
                <span>{message.text}</span>
              </>
            ) : (
              <>
                <strong>{message.author}</strong>
                <span>{message.text}</span>
                {mlIntentBadgesByMessageId[message.id] ? (
                  <span
                    className={`chatMlIntentBadge chatMlIntentBadge--${mlIntentBadgesByMessageId[message.id].intentSource}`}
                  >
                    {formatMlIntentBadge(mlIntentBadgesByMessageId[message.id])}
                  </span>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <div className="chatInputRow">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSendChatMessage();
            }
          }}
          maxLength={300}
          placeholder="Hỏi về sản phẩm: giá?, còn màu đen không?, xin link..."
        />
        <button type="button" onClick={handleSendChatMessage}>
          Send
        </button>
      </div>
    </aside>
  );
}

function formatMlIntentBadge(badge: ChatMlIntentBadge): string {
  if (badge.intentSource === "ml" && badge.confidence !== null) {
    return `${badge.label} ${(badge.confidence * 100).toFixed(0)}%`;
  }

  if (badge.intentSource === "regex_fallback") {
    const confidenceLabel =
      badge.confidence !== null ? ` ${(badge.confidence * 100).toFixed(0)}%` : "";
    return `rules fallback · ${badge.mappedIntent ?? badge.label}${confidenceLabel}`;
  }

  return badge.label;
}
