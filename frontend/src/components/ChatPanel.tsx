import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  appendUniqueChatMessage,
  createChatSocket,
  createOutgoingAssistantChatMessage,
  createOutgoingChatMessage,
  normalizeChatMessage,
  type ChatEvent,
  type ChatMessage,
} from "../api/chat";
import type { CommerceSuggestedAction } from "../features/commerce/commerceTypes";
import { isAssistantChatMessage } from "../features/sales-assistant/assistantChatMessages";
import { renderAssistantReplyText } from "../features/sales-assistant/renderAssistantReplyText";
import { formatIntentLabel } from "../features/sales-nlp/formatChatIntentLabel";
import type { ChatMlIntentBadge } from "../features/sales-nlp/mlIntentBridge";
import { getProductById } from "../features/product-catalog";
import { useI18n } from "../i18n/I18nProvider";


type ChatPanelProps = {
  roomId: string;
  author: string;
  displayNameLocked?: boolean;
  sessionKey?: number;
  mlIntentBadgesByMessageId?: Record<string, ChatMlIntentBadge>;
  onViewerMessageSent?: (message: {
    messageId: string;
    author: string;
    text: string;
  }) => void;
  onCommerceAction?: (action: CommerceSuggestedAction) => void;
};

export type ChatPanelHandle = {
  sendAssistantMessage: (message: ChatMessage) => void;
};

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  {
    roomId,
    author,
    displayNameLocked = false,
    sessionKey = 0,
    mlIntentBadgesByMessageId = {},
    onViewerMessageSent,
    onCommerceAction,
  },
  ref,
) {
  const { t } = useI18n();
  const socketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const displayNameRef = useRef(author);
  const onViewerMessageSentRef = useRef(onViewerMessageSent);
  const skipNextHistoryRef = useRef(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayName, setDisplayName] = useState(author);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cartFeedbackByMessageId, setCartFeedbackByMessageId] = useState<Record<string, string>>(
    {},
  );

  displayNameRef.current = displayName;
  onViewerMessageSentRef.current = onViewerMessageSent;

  useImperativeHandle(
    ref,
    () => ({
      sendAssistantMessage(message: ChatMessage) {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        if (!message.text.trim()) {
          return;
        }

        socket.send(JSON.stringify(createOutgoingAssistantChatMessage(message)));
      },
    }),
    [],
  );

  useEffect(() => {
    setMessages([]);
    setCartFeedbackByMessageId({});
    skipNextHistoryRef.current = true;
  }, [sessionKey]);

  useEffect(() => {
    setDisplayName(author);
  }, [author]);

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
      setErrorMessage(t("chatErrorConnect"));
    };
    socket.onmessage = (event) => {
      try {
        handleChatEvent(JSON.parse(event.data) as ChatEvent);
      } catch {
        setErrorMessage(t("chatErrorRead"));
      }
    };

    return () => {
      socket.close();
    };
  }, [roomId, sessionKey, t]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
    });
  }, [messages, cartFeedbackByMessageId]);

  function handleChatEvent(event: ChatEvent) {
    if (event.type === "chat_history") {
      if (skipNextHistoryRef.current) {
        skipNextHistoryRef.current = false;
        return;
      }

      setMessages(
        event.messages.map((message) =>
          normalizeChatMessage(message as unknown as Record<string, unknown>),
        ),
      );
      return;
    }

    if (event.type === "chat_message") {
      const normalized = normalizeChatMessage(event);
      setMessages((currentMessages) => appendUniqueChatMessage(currentMessages, normalized));
      setErrorMessage(null);

      if (normalized.author === displayNameRef.current.trim()) {
        onViewerMessageSentRef.current?.({
          messageId: normalized.id,
          author: normalized.author,
          text: normalized.text,
        });
      }
      return;
    }

    setErrorMessage(event.message);
  }

  function clearChatError() {
    setErrorMessage(null);
  }

  function handleSendChatMessage() {
    const text = input.trim();
    const sender = displayName.trim();
    const socket = socketRef.current;

    clearChatError();

    if (!text || !sender || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(createOutgoingChatMessage(sender, text)));
    setInput("");
  }

  function handleAddToCart(action: CommerceSuggestedAction, messageId: string) {
    onCommerceAction?.(action);

    const productName =
      action.productId ? getProductById(action.productId)?.name ?? action.label : action.label;

    setCartFeedbackByMessageId((current) => ({
      ...current,
      [messageId]: t("chatAddedToCart", { product: productName }),
    }));
  }

  return (
    <aside className="chatPanel">
      <div className="chatHeader">
        <div>
          <h2>{t("liveChat")}</h2>
          <span>{t("chatMessages", { count: messages.length })}</span>
        </div>
        <span className={`status ${status}`}>{t("wsStatus", { status })}</span>
      </div>
      <label className="chatDisplayName">
        <span>{t("displayName")}</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={displayNameLocked}
          maxLength={32}
          placeholder={t("displayNamePlaceholder")}
        />
        {displayNameLocked ? <small>{t("displayNameFromLogin")}</small> : null}
      </label>
      <div className="chatMessages" ref={messagesRef}>
        {messages.map((message) => (
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
                  {t("replyingTo", {
                    author: message.replyToAuthor ?? "",
                    text: message.replyToText ?? "",
                  })}
                </span>
                <span className="chatReplyText">{renderAssistantReplyText(message.text)}</span>
                {message.commerceActions
                  ?.filter((action) => action.type === "add_to_cart")
                  .map((action) => (
                    <div className="chatCommerceActions" key={action.id}>
                      <button
                        type="button"
                        className="chatCommerceButton"
                        onClick={() => handleAddToCart(action, message.id)}
                      >
                        {t("chatAddToCart")}
                      </button>
                    </div>
                  ))}
                {cartFeedbackByMessageId[message.id] ? (
                  <span className="chatCommerceFeedback">{cartFeedbackByMessageId[message.id]}</span>
                ) : null}
              </>
            ) : (
              <>
                <strong>{message.author}</strong>
                <span>{message.text}</span>
                {mlIntentBadgesByMessageId[message.id] ? (
                  <span
                    className={`chatMlIntentBadge chatMlIntentBadge--${mlIntentBadgesByMessageId[message.id].intentSource}`}
                  >
                    {formatMlIntentBadge(mlIntentBadgesByMessageId[message.id], t)}
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
          onChange={(event) => {
            clearChatError();
            setInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSendChatMessage();
            }
          }}
          maxLength={300}
          placeholder={t("chatPlaceholder")}
        />
        <button type="button" onClick={handleSendChatMessage}>
          {t("send")}
        </button>
      </div>
    </aside>
  );
});

function formatMlIntentBadge(
  badge: ChatMlIntentBadge,
  t: (key: import("../i18n/translations").TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const primaryLabel =
    badge.intentSource === "ml"
      ? badge.label
      : (badge.mappedIntent ?? badge.label);
  const localizedIntent = formatIntentLabel(primaryLabel, t);

  if (badge.intentSource === "ml" && badge.confidence !== null) {
    return `${localizedIntent} ${(badge.confidence * 100).toFixed(0)}%`;
  }

  if (badge.intentSource === "regex_fallback") {
    const confidenceLabel =
      badge.confidence !== null ? ` ${(badge.confidence * 100).toFixed(0)}%` : "";
    return `${t("chatIntentRulesFallback", { intent: localizedIntent })}${confidenceLabel}`;
  }

  return localizedIntent;
}
