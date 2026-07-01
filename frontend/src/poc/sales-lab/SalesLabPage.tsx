import { useCallback, useMemo, useRef, useState } from "react";

import {
  CartPanel,
  CheckoutModal,
  OrderSummary,
  useCommerceCart,
} from "../../features/commerce";
import {
  processSalesCommentWithMl,
  shouldAutoReplyInChat,
} from "../../features/sales-assistant/processSalesComment";
import type { ChatMlIntentBadge } from "../../features/sales-nlp/mlIntentBridge";
import type { SalesAssistantAnalytics, SalesAssistantEvent } from "../../features/sales-assistant/salesAssistantTypes";
import {
  DEFAULT_PINNED_PRODUCT_ID,
  getAllProducts,
  getProductById,
  mapArEffectTypeToBrowserAr,
} from "../../features/product-catalog";
import { ProductCatalogPanel } from "../../features/product-catalog/components/ProductCatalogPanel";
import { PinnedProductPanel } from "../../features/sales-assistant/PinnedProductPanel";
import { ProductContextControl } from "../../features/sales-assistant/ProductContextControl";
import type { ProductContextSource } from "../../features/sales-nlp/salesNlpTypes";
import { SalesAssistantPanel } from "../../features/sales-assistant/SalesAssistantPanel";
import {
  BROWSER_AR_EFFECT_LABELS,
  type BrowserArEffect,
} from "../../features/browser-ar/types";
import { BrowserArStream } from "../../features/browser-ar/components/BrowserArStream";
import { createInitialAnalytics, AI_SALES_ASSISTANT_ACTOR } from "../../features/sales-assistant/salesAssistantTypes";

type SimulatedChatMessage = {
  id: string;
  author: string;
  text: string;
  kind: "viewer" | "assistant";
  replyToAuthor?: string;
  replyToText?: string;
};

export function SalesLabPage() {
  const [pinnedProductId, setPinnedProductId] = useState(DEFAULT_PINNED_PRODUCT_ID);
  const [cameraProductId, setCameraProductId] = useState<string | null>(null);
  const [lastContextSource, setLastContextSource] = useState<ProductContextSource | null>(null);
  const [arEffect, setArEffect] = useState<BrowserArEffect>("glasses");
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [chatMessages, setChatMessages] = useState<SimulatedChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [viewerName, setViewerName] = useState("viewer_01");
  const [salesEvents, setSalesEvents] = useState<SalesAssistantEvent[]>([]);
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAssistantAnalytics>(
    createInitialAnalytics(),
  );
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

  function handlePinProduct(productId: string) {
    const product = getProductById(productId);
    if (!product) {
      return;
    }
    setPinnedProductId(productId);
    setArEffect(mapArEffectTypeToBrowserAr(product.arEffectType));
  }

  async function handleSendComment() {
    const text = chatInput.trim();
    const author = viewerName.trim() || "viewer";
    if (!text) {
      return;
    }

    const viewerMessageId = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const viewerMessage: SimulatedChatMessage = {
      id: viewerMessageId,
      author,
      text,
      kind: "viewer",
    };

    setChatInput("");

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
        [viewerMessageId]: result.chatMlBadge!,
      }));
    }

    setSalesAnalytics(result.analytics);

    if (result.event) {
      setLastContextSource(result.event.contextSource);
      setSalesEvents((events) => [result.event!, ...events]);
    }

    setChatMessages((current) => {
      const nextMessages = [...current, viewerMessage];
      if (result.event && shouldAutoReplyInChat(result.event)) {
        nextMessages.push({
          id: `assistant-${result.event.id}`,
          author: AI_SALES_ASSISTANT_ACTOR,
          text: result.event.suggestedReply,
          kind: "assistant",
          replyToAuthor: author,
          replyToText: text,
        });
      }
      return nextMessages;
    });
  }

  return (
    <main className="page salesLabPage">
      <header className="salesLabHeader">
        <div>
          <p className="eyebrow">Sales / NLP POC</p>
          <h1>Sales Lab</h1>
          <p className="streamMeta">
            Rule-based NLP pipeline · product catalog · simulated livestream chat
          </p>
        </div>
        <div className="modeToggle">
          <a className="modeLink" href="/">
            Main Demo
          </a>
          <a className="modeLink" href="/poc/ar-lab">
            AR Lab
          </a>
        </div>
      </header>

      <section className="salesLabGrid">
        <div className="salesLabColumn salesLabColumnLeft">
          <PinnedProductPanel product={pinnedProduct} />
          <ProductContextControl
            pinnedProduct={pinnedProduct}
            cameraProduct={cameraProduct}
            lastContextSource={lastContextSource}
            onMarkCameraProduct={() => setCameraProductId(pinnedProductId)}
            onClearCameraProduct={() => setCameraProductId(null)}
          />
          <ProductCatalogPanel
            pinnedProductId={pinnedProductId}
            onPinProduct={handlePinProduct}
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
        </div>

        <div className="salesLabColumn salesLabColumnCenter">
          <section className="videoCard salesLabChatPanel">
            <div className="cardHeader">
              <h2>Simulated Live Chat</h2>
              <span className="status">Viewer comments</span>
            </div>
            <label className="chatDisplayName">
              <span>Viewer name</span>
              <input
                value={viewerName}
                onChange={(event) => setViewerName(event.target.value)}
                maxLength={32}
              />
            </label>
            <div className="salesLabChatMessages">
              {chatMessages.length === 0 ? (
                <p className="emptyState">
                  Try: giá?, kính này bao nhiêu, còn màu đen không, ship Hà Nội không, chốt
                  đơn
                </p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    className={
                      message.kind === "assistant"
                        ? "chatMessage chatMessageAssistant"
                        : "chatMessage"
                    }
                    key={message.id}
                  >
                    <strong>{message.author}</strong>
                    {message.kind === "assistant" && message.replyToAuthor ? (
                      <span className="chatReplyContext">
                        Replying to {message.replyToAuthor}: {message.replyToText}
                      </span>
                    ) : null}
                    <span>{message.text}</span>
                    {message.kind === "viewer" && mlIntentBadgesByMessageId[message.id] ? (
                      <span
                        className={`chatMlIntentBadge chatMlIntentBadge--${mlIntentBadgesByMessageId[message.id].intentSource}`}
                      >
                        {formatMlIntentBadge(mlIntentBadgesByMessageId[message.id])}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="chatInputRow">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSendComment();
                  }
                }}
                placeholder="Nhập comment viewer..."
              />
              <button type="button" onClick={handleSendComment}>
                Send
              </button>
            </div>
          </section>

          <section className="videoCard salesLabArPanel">
            <div className="cardHeader">
              <h2>Browser AR Preview</h2>
              <span className="status">{BROWSER_AR_EFFECT_LABELS[arEffect]}</span>
            </div>
            <p className="panelDescription">
              AR effect follows pinned product mapping: {pinnedProduct.arEffectType} →{" "}
              {BROWSER_AR_EFFECT_LABELS[arEffect]}
            </p>
            <BrowserArStream
              isLive={isStreamLive}
              effect={arEffect}
              debugOverlay={false}
              hostLabel="@sales-lab"
            />
            <div className="controlBar">
              <button type="button" onClick={() => setIsStreamLive(true)}>
                Start AR Preview
              </button>
              <button type="button" onClick={() => setIsStreamLive(false)}>
                Stop
              </button>
            </div>
          </section>
        </div>

        <div className="salesLabColumn salesLabColumnRight">
          <SalesAssistantPanel
            events={salesEvents}
            analytics={salesAnalytics}
            onCommerceAction={cart.applySuggestedAction}
          />
        </div>
      </section>
    </main>
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
