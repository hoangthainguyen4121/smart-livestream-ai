import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
import {
  CLIENT_SEND_COOLDOWN_MS,
  formatChatSpamGuardMessage,
  isChatSendDisabled,
  isChatSpamErrorCode,
  remainingSecondsUntil,
} from "../api/chatSendUx";
import type { CommerceSuggestedAction } from "../features/commerce/commerceTypes";
import { getOrCreateViewerSessionKey } from "../features/intent-correction/viewerSessionKey";
import { isAssistantChatMessage } from "../features/sales-assistant/assistantChatMessages";
import { IntentCorrectionPanel } from "../features/intent-correction/IntentCorrectionPanel";
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
    createdAt: string;
  }) => void;
  correctionContextByMessageId?: Record<string, import("../features/intent-correction/intentCorrectionTypes").CommentCorrectionContext>;
  submittedCorrectionMessageIds?: Record<string, boolean>;
  onCorrectionSubmitted?: (messageId: string) => void;
  onCommerceAction?: (action: CommerceSuggestedAction) => void;
  chatDisabled?: boolean;
  onLiveSessionEnded?: (payload: { reason: string; sessionId?: string }) => void;
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
    correctionContextByMessageId = {},
    submittedCorrectionMessageIds = {},
    onCorrectionSubmitted,
    onViewerMessageSent,
    onCommerceAction,
    chatDisabled = false,
    onLiveSessionEnded,
  },
  ref,
) {
  const { t } = useI18n();
  const socketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const displayNameRef = useRef(author);
  const onViewerMessageSentRef = useRef(onViewerMessageSent);
  const onLiveSessionEndedRef = useRef(onLiveSessionEnded);
  const skipNextHistoryRef = useRef(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayName, setDisplayName] = useState(author);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendCooldownUntilMs, setSendCooldownUntilMs] = useState(0);
  const [retryUntilMs, setRetryUntilMs] = useState(0);
  const [spamErrorCode, setSpamErrorCode] = useState<import("../api/chatSendUx").ChatSpamErrorCode | null>(
    null,
  );
  const [sendBlockedTick, setSendBlockedTick] = useState(0);
  const [cartFeedbackByMessageId, setCartFeedbackByMessageId] = useState<Record<string, string>>(
    {},
  );

  displayNameRef.current = displayName;
  onViewerMessageSentRef.current = onViewerMessageSent;
  onLiveSessionEndedRef.current = onLiveSessionEnded;

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
    setSendCooldownUntilMs(0);
    setRetryUntilMs(0);
    setSpamErrorCode(null);
    skipNextHistoryRef.current = true;
    stickToBottomRef.current = true;
  }, [sessionKey]);

  useEffect(() => {
    const now = Date.now();
    if (!isChatSendDisabled(now, sendCooldownUntilMs, retryUntilMs)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const tickNow = Date.now();
      setSendBlockedTick(tickNow);
      if (spamErrorCode && retryUntilMs > tickNow) {
        setErrorMessage(
          formatChatSpamGuardMessage(
            spamErrorCode,
            remainingSecondsUntil(retryUntilMs, tickNow),
            t,
          ),
        );
      } else if (spamErrorCode && retryUntilMs <= tickNow) {
        setRetryUntilMs(0);
        setSpamErrorCode(null);
        setErrorMessage(null);
      }
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sendCooldownUntilMs, retryUntilMs, spamErrorCode, t]);

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

  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container || !stickToBottomRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages, cartFeedbackByMessageId]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 140;
    };

    // Ensure wheel scrolls the chat list instead of the page behind sticky column.
    const onWheel = (event: WheelEvent) => {
      const canScroll = container.scrollHeight > container.clientHeight + 1;
      if (!canScroll) {
        return;
      }

      const atTop = container.scrollTop <= 0;
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
      const scrollingUp = event.deltaY < 0;
      const scrollingDown = event.deltaY > 0;

      if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
        event.preventDefault();
        event.stopPropagation();
        container.scrollTop += event.deltaY;
        onScroll();
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

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
        setSendCooldownUntilMs(Date.now() + CLIENT_SEND_COOLDOWN_MS);
        onViewerMessageSentRef.current?.({
          messageId: normalized.id,
          author: normalized.author,
          text: normalized.text,
          createdAt: normalized.created_at,
        });
      }
      return;
    }

    if (event.type === "live_session_ended") {
      onLiveSessionEndedRef.current?.({
        reason: event.reason,
        sessionId: event.session_id,
      });
      return;
    }

    if (event.type !== "error") {
      return;
    }

    if (event.code && isChatSpamErrorCode(event.code) && event.retry_after_seconds !== undefined) {
      const retrySeconds = Math.max(0, event.retry_after_seconds);
      setSpamErrorCode(event.code);
      setRetryUntilMs(Date.now() + retrySeconds * 1000);
      setErrorMessage(formatChatSpamGuardMessage(event.code, retrySeconds, t));
      return;
    }

    setSpamErrorCode(null);
    setErrorMessage(event.message);
  }

  function clearChatError() {
    setErrorMessage(null);
    setSpamErrorCode(null);
  }

  function handleSendChatMessage() {
    const text = input.trim();
    const sender = displayName.trim();
    const socket = socketRef.current;
    const now = Date.now();

    clearChatError();

    if (
      chatDisabled ||
      !text ||
      !sender ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      isChatSendDisabled(now, sendCooldownUntilMs, retryUntilMs)
    ) {
      return;
    }

    socket.send(
      JSON.stringify(createOutgoingChatMessage(sender, text, getOrCreateViewerSessionKey())),
    );
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

  // sendBlockedTick only forces periodic renders; Date.now() is the actual clock.
  // Reusing the last tick here can leave the send button locked after the timer expires.
  void sendBlockedTick;
  const sendBlockedNow =
    chatDisabled ||
    isChatSendDisabled(Date.now(), sendCooldownUntilMs, retryUntilMs);

  const knownMessageIdsRef = useRef<Set<string> | null>(null);
  const [enterMessageIds, setEnterMessageIds] = useState<Record<string, true>>({});

  useEffect(() => {
    knownMessageIdsRef.current = null;
    setEnterMessageIds({});
  }, [sessionKey, roomId]);

  useEffect(() => {
    if (knownMessageIdsRef.current === null) {
      knownMessageIdsRef.current = new Set(messages.map((message) => message.id));
      return;
    }

    const known = knownMessageIdsRef.current;
    const incoming: string[] = [];
    for (const message of messages) {
      if (!known.has(message.id)) {
        known.add(message.id);
        incoming.push(message.id);
      }
    }
    if (incoming.length === 0) {
      return;
    }

    setEnterMessageIds((current) => {
      const next = { ...current };
      for (const id of incoming) {
        next[id] = true;
      }
      return next;
    });
  }, [messages]);

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
      <div
        className="chatMessages"
        ref={messagesRef}
        tabIndex={0}
        role="log"
        aria-label={t("liveChat")}
        aria-live="polite"
      >
        {messages.map((message) => (
          <div
            className={[
              "chatMessage",
              isAssistantChatMessage(message) ? "chatMessageAssistant" : "",
              enterMessageIds[message.id] ? "chatMessage--enter" : "",
            ]
              .filter(Boolean)
              .join(" ")}
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
                {correctionContextByMessageId[message.id] &&
                !submittedCorrectionMessageIds[message.id] ? (
                  <IntentCorrectionPanel
                    context={correctionContextByMessageId[message.id]}
                    onSubmitted={(commentId) => onCorrectionSubmitted?.(commentId)}
                  />
                ) : null}
                {submittedCorrectionMessageIds[message.id] ? (
                  <span className="chatCorrectionSubmitted">{t("intentCorrectionSubmitted")}</span>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="chatPanelFooter">
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
          <button type="button" onClick={handleSendChatMessage} disabled={sendBlockedNow}>
            {t("send")}
          </button>
        </div>
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
