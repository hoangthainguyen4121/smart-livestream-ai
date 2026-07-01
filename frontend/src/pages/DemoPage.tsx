import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type ChatMessage } from "../api/chat";
import { AiEventFeedPanel } from "../components/AiEventFeedPanel";
import { ChatPanel } from "../components/ChatPanel";
import { BrowserArStream } from "../features/browser-ar/components/BrowserArStream";
import {
  BROWSER_AR_EFFECT_LABELS,
  type BrowserArEffect,
} from "../features/browser-ar/types";
import {
  CartPanel,
  CheckoutModal,
  OrderSummary,
  useCommerceCart,
} from "../features/commerce";
import {
  DEFAULT_PINNED_PRODUCT_ID,
  getAllProducts,
  getProductById,
  mapArEffectTypeToBrowserAr,
} from "../features/product-catalog";
import { ProductCatalogPanel } from "../features/product-catalog/components/ProductCatalogPanel";
import { PinnedProductPanel } from "../features/sales-assistant/PinnedProductPanel";
import { ProductContextControl } from "../features/sales-assistant/ProductContextControl";
import { buildAssistantChatMessage } from "../features/sales-assistant/assistantChatMessages";
import { processSalesCommentWithMl, shouldAutoReplyInChat } from "../features/sales-assistant/processSalesComment";
import type { ChatMlIntentBadge } from "../features/sales-nlp/mlIntentBridge";
import type { ProductContextSource } from "../features/sales-nlp/salesNlpTypes";
import { SalesAssistantPanel } from "../features/sales-assistant/SalesAssistantPanel";
import {
  createInitialAnalytics,
  type SalesAssistantAnalytics,
  type SalesAssistantEvent,
} from "../features/sales-assistant/salesAssistantTypes";


const HOST_USERNAME = "hoang";
const DEMO_ROOM_ID = "demo";
const MOCK_VIEWER_COUNT = 128;
const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "demo-initial-1",
    room_id: DEMO_ROOM_ID,
    author: "Minh",
    text: "Hello!",
    created_at: "",
  },
  {
    id: "demo-initial-2",
    room_id: DEMO_ROOM_ID,
    author: "An",
    text: "Nice stream!",
    created_at: "",
  },
  {
    id: "demo-initial-3",
    room_id: DEMO_ROOM_ID,
    author: "Khoa",
    text: "Raise your hand!",
    created_at: "",
  },
];

const AR_EFFECTS = Object.keys(BROWSER_AR_EFFECT_LABELS) as BrowserArEffect[];

export function DemoPage() {
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [streamDurationSeconds, setStreamDurationSeconds] = useState(0);
  const [pinnedProductId, setPinnedProductId] = useState(DEFAULT_PINNED_PRODUCT_ID);
  const [cameraProductId, setCameraProductId] = useState<string | null>(null);
  const [lastContextSource, setLastContextSource] = useState<ProductContextSource | null>(null);
  const [effect, setEffect] = useState<BrowserArEffect>("glasses");
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [salesEvents, setSalesEvents] = useState<SalesAssistantEvent[]>([]);
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAssistantAnalytics>(
    createInitialAnalytics(),
  );
  const [assistantRepliesByTriggerId, setAssistantRepliesByTriggerId] = useState<
    Record<string, ChatMessage>
  >({});
  const [mlIntentBadgesByMessageId, setMlIntentBadgesByMessageId] = useState<
    Record<string, ChatMlIntentBadge>
  >({});
  const salesAnalyticsRef = useRef(salesAnalytics);
  const cartPanelRef = useRef<HTMLElement>(null);

  salesAnalyticsRef.current = salesAnalytics;

  const scrollToCart = useCallback(() => {
    cartPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const cart = useCommerceCart({ onOpenCart: scrollToCart });

  const pinnedProduct = useMemo(
    () => getProductById(pinnedProductId) ?? getAllProducts()[0],
    [pinnedProductId],
  );

  const cameraProduct = useMemo(
    () => (cameraProductId ? getProductById(cameraProductId) ?? null : null),
    [cameraProductId],
  );

  useEffect(() => {
    if (!isStreamLive) {
      return;
    }

    const timer = window.setInterval(() => {
      setStreamDurationSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isStreamLive]);

  function handlePinProduct(productId: string) {
    const product = getProductById(productId);
    if (!product) {
      return;
    }
    setPinnedProductId(productId);
    if (!isStreamLive) {
      setEffect(mapArEffectTypeToBrowserAr(product.arEffectType));
    }
  }

  const handleViewerMessageSent = useCallback(
    async ({ messageId, author, text }: { messageId: string; author: string; text: string }) => {
      const result = await processSalesCommentWithMl(
        {
          comment: text,
          viewerAuthor: author,
          pinnedProduct,
          catalog: getAllProducts(),
          selectedCameraProductId: cameraProductId,
          autoReplyInChat: true,
        },
        salesAnalyticsRef.current,
      );

      if (result.chatMlBadge) {
        setMlIntentBadgesByMessageId((current) => ({
          ...current,
          [messageId]: result.chatMlBadge!,
        }));
      }

      setSalesAnalytics(result.analytics);

      if (!result.event) {
        return;
      }

      setLastContextSource(result.event.contextSource);
      setSalesEvents((currentEvents) => [result.event!, ...currentEvents]);

      if (shouldAutoReplyInChat(result.event)) {
        setAssistantRepliesByTriggerId((currentReplies) => {
          if (currentReplies[messageId]) {
            return currentReplies;
          }

          return {
            ...currentReplies,
            [messageId]: buildAssistantChatMessage(result.event!, {
              id: messageId,
              author,
              text,
              room_id: DEMO_ROOM_ID,
            }),
          };
        });
      }
    },
    [cameraProductId, pinnedProduct],
  );

  function handleRegisterFaceClick(event: { preventDefault: () => void }) {
    event.preventDefault();
    setIsStreamLive(false);
    window.setTimeout(() => {
      window.location.href = "/register-face";
    }, 500);
  }

  function handleStopStream() {
    setIsStreamLive(false);
    setStreamDurationSeconds(0);
  }

  return (
    <main className="page">
      <section className="livestreamShell">
        <div className="streamMain">
          <header className="streamHeader">
            <div>
              <p className="eyebrow">Smart Livestream AI MVP</p>
              <h1>AI Livestream Demo</h1>
              <p className="streamMeta">
                Hosted by <strong>@{HOST_USERNAME}</strong> · Browser AR · AI Sales Assistant
                NLP POC
              </p>
            </div>
            <div className="streamStats">
              <span className={isStreamLive ? "liveBadge" : "offlineBadge"}>
                {isStreamLive ? "LIVE" : "OFFLINE"}
              </span>
              <span>{MOCK_VIEWER_COUNT} viewers</span>
              <span>{formatDuration(streamDurationSeconds)}</span>
            </div>
          </header>

          <section className="modeToggle" aria-label="Stream actions">
            {AR_EFFECTS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={effect === entry ? "active" : ""}
                onClick={() => setEffect(entry)}
                disabled={isStreamLive}
              >
                {BROWSER_AR_EFFECT_LABELS[entry]}
              </button>
            ))}
            <button
              type="button"
              className={debugOverlay ? "active" : ""}
              onClick={() => setDebugOverlay((value) => !value)}
            >
              Debug
            </button>
            <a className="modeLink" href="/register-face" onClick={handleRegisterFaceClick}>
              Register Face
            </a>
            <a className="modeLink" href="/poc/ar-lab">
              AR Lab
            </a>
            <a className="modeLink" href="/poc/sales-lab">
              Sales Lab
            </a>
          </section>

          <div className="streamMediaRow">
            <div className="videoCard">
              <div className="cardHeader">
                <h2>Browser AR Stream</h2>
                <span className="status">{BROWSER_AR_EFFECT_LABELS[effect]}</span>
              </div>

              <BrowserArStream
                isLive={isStreamLive}
                effect={effect}
                debugOverlay={debugOverlay}
                hostLabel={`@${HOST_USERNAME}`}
              />
            </div>

            <PinnedProductPanel product={pinnedProduct} />
            <ProductContextControl
              pinnedProduct={pinnedProduct}
              cameraProduct={cameraProduct}
              lastContextSource={lastContextSource}
              onMarkCameraProduct={() => setCameraProductId(pinnedProductId)}
              onClearCameraProduct={() => setCameraProductId(null)}
            />
          </div>

          <ProductCatalogPanel
            compact
            pinnedProductId={pinnedProductId}
            onPinProduct={handlePinProduct}
          />

          <section className="controlBar">
            <button type="button" onClick={() => setIsStreamLive(true)}>
              Start Stream
            </button>
            <button type="button" onClick={handleStopStream}>
              Stop Stream
            </button>
          </section>

          <SalesAssistantPanel
            events={salesEvents}
            analytics={salesAnalytics}
            onCommerceAction={cart.applySuggestedAction}
          />

          <section className="commerceRow" ref={cartPanelRef}>
            <CartPanel
              items={cart.items}
              itemCount={cart.itemCount}
              subtotal={cart.subtotal}
              pinnedProductName={pinnedProduct.name}
              onAddPinnedProduct={() => cart.addPinnedProduct(pinnedProduct)}
              onRemoveItem={cart.removeLine}
              onUpdateQuantity={cart.updateLineQuantity}
              onCheckout={cart.openCheckout}
              onClearCart={cart.clearCart}
            />
            <OrderSummary order={cart.order} isPaying={cart.isPaying} />
          </section>

          <CheckoutModal
            open={cart.checkoutOpen}
            items={cart.items}
            subtotal={cart.subtotal}
            form={cart.checkoutForm}
            onClose={cart.closeCheckout}
            onChange={cart.updateCheckoutField}
            onSubmit={cart.submitCheckout}
          />

          <AiEventFeedPanel />
        </div>

        <ChatPanel
          roomId={DEMO_ROOM_ID}
          author={HOST_USERNAME}
          initialMessages={INITIAL_CHAT_MESSAGES}
          assistantRepliesByTriggerId={assistantRepliesByTriggerId}
          mlIntentBadgesByMessageId={mlIntentBadgesByMessageId}
          onViewerMessageSent={handleViewerMessageSent}
        />
      </section>
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
