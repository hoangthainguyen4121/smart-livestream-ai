import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel, type ChatPanelHandle } from "../components/ChatPanel";
import { BrowserArStream, type BrowserArStreamHandle } from "../features/browser-ar/components/BrowserArStream";
import { useCameraProductRecognition } from "../features/camera-product-recognition/useCameraProductRecognition";
import { type BrowserArEffect } from "../features/browser-ar/types";
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
import { useI18n } from "../i18n/I18nProvider";


const HOST_USERNAME = "hoang";
const DEMO_ROOM_ID = "demo";

const AR_EFFECTS: BrowserArEffect[] = ["none", "glasses", "makeup_lite", "full_filter"];

export function DemoPage() {
  const { t, locale, setLocale } = useI18n();
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [streamDurationSeconds, setStreamDurationSeconds] = useState(0);
  const [liveSessionKey, setLiveSessionKey] = useState(0);
  const [sessionViewerCount, setSessionViewerCount] = useState(0);
  const [sessionMessageCount, setSessionMessageCount] = useState(0);
  const [pinnedProductId, setPinnedProductId] = useState(DEFAULT_PINNED_PRODUCT_ID);
  const [cameraProductId, setCameraProductId] = useState<string | null>(null);
  const [lastContextSource, setLastContextSource] = useState<ProductContextSource | null>(null);
  const [effect, setEffect] = useState<BrowserArEffect>("glasses");
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [salesEvents, setSalesEvents] = useState<SalesAssistantEvent[]>([]);
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAssistantAnalytics>(
    createInitialAnalytics(),
  );
  const [mlIntentBadgesByMessageId, setMlIntentBadgesByMessageId] = useState<
    Record<string, ChatMlIntentBadge>
  >({});
  const salesAnalyticsRef = useRef(salesAnalytics);
  const isStreamLiveRef = useRef(isStreamLive);
  const sessionViewerAuthorsRef = useRef<Set<string>>(new Set());
  const cartPanelRef = useRef<HTMLElement>(null);
  const browserArRef = useRef<BrowserArStreamHandle | null>(null);
  const chatPanelRef = useRef<ChatPanelHandle | null>(null);

  salesAnalyticsRef.current = salesAnalytics;
  isStreamLiveRef.current = isStreamLive;

  const effectLabels = useMemo(
    () => ({
      none: t("effectNone"),
      glasses: t("effectGlasses"),
      makeup_lite: t("effectMakeupLite"),
      full_filter: t("effectFullFilter"),
    }),
    [t],
  );

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

  const captureFrame = useCallback(() => browserArRef.current?.captureFrame() ?? null, []);

  const cameraRecognition = useCameraProductRecognition({
    isLive: isStreamLive,
    catalog: getAllProducts(),
    captureFrame,
  });

  const activeVisionProduct = useMemo(
    () =>
      cameraRecognition.activeVisionProductId
        ? getProductById(cameraRecognition.activeVisionProductId) ?? null
        : null,
    [cameraRecognition.activeVisionProductId],
  );

  const resetLiveSessionState = useCallback(() => {
    sessionViewerAuthorsRef.current = new Set();
    setSessionViewerCount(0);
    setSessionMessageCount(0);
    setSalesAnalytics(createInitialAnalytics());
    setSalesEvents([]);
    setMlIntentBadgesByMessageId({});
    setLastContextSource(null);
    setLiveSessionKey((value) => value + 1);
  }, []);

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

  function handleStartStream() {
    resetLiveSessionState();
    setStreamDurationSeconds(0);
    setIsStreamLive(true);
  }

  function handleStopStream() {
    setIsStreamLive(false);
    setStreamDurationSeconds(0);
    resetLiveSessionState();
  }

  const handleViewerMessageSent = useCallback(
    async ({ messageId, author, text }: { messageId: string; author: string; text: string }) => {
      if (!isStreamLiveRef.current) {
        return;
      }

      sessionViewerAuthorsRef.current.add(author);
      setSessionViewerCount(sessionViewerAuthorsRef.current.size);
      setSessionMessageCount((value) => value + 1);

      const result = await processSalesCommentWithMl(
        {
          comment: text,
          viewerAuthor: author,
          pinnedProduct,
          catalog: getAllProducts(),
          selectedCameraProductId: cameraProductId,
          detectedCameraProductId: cameraRecognition.activeVisionProductId,
          detectedCameraConfidence: cameraRecognition.detection.match?.confidence ?? null,
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
        const assistantMessage = buildAssistantChatMessage(result.event, {
          id: messageId,
          author,
          text,
          room_id: DEMO_ROOM_ID,
        });
        chatPanelRef.current?.sendAssistantMessage(assistantMessage);
      }
    },
    [cameraProductId, cameraRecognition.activeVisionProductId, cameraRecognition.detection.match, pinnedProduct],
  );

  function toggleLocale() {
    setLocale(locale === "vi" ? "en" : "vi");
  }

  return (
    <main className="page">
      <section className="livestreamShell">
        <div className="streamMain">
          <header className="streamHeader">
            <div className="streamHeaderMain">
              <p className="eyebrow">{t("appEyebrow")}</p>
              <h1>{t("appTitle")}</h1>
              <p className="streamMeta">
                {t("appMeta", { host: HOST_USERNAME })}
              </p>
              <div className="streamHeaderActions">
                {!isStreamLive ? (
                  <button
                    type="button"
                    className="streamControlButton streamControlButtonStart"
                    onClick={handleStartStream}
                  >
                    <StartLiveIcon />
                    {t("startStream")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="streamControlButton streamControlButtonStop"
                    onClick={handleStopStream}
                  >
                    <StopLiveIcon />
                    {t("stopStream")}
                  </button>
                )}
                <button type="button" className="langToggleButton" onClick={toggleLocale}>
                  {locale === "vi" ? t("langToggle") : t("langToggleVi")}
                </button>
              </div>
            </div>
            <div className="streamStats">
              <span className={isStreamLive ? "liveBadge" : "offlineBadge"}>
                {isStreamLive ? t("live") : t("offline")}
              </span>
              <span>{t("viewers", { count: sessionViewerCount })}</span>
              <span>{t("messages", { count: sessionMessageCount })}</span>
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
                {effectLabels[entry]}
              </button>
            ))}
            <button
              type="button"
              className={debugOverlay ? "active" : ""}
              onClick={() => setDebugOverlay((value) => !value)}
            >
              {t("debugOverlay")}
            </button>
          </section>

          <div className="streamMediaRow">
            <div className="videoCard">
              <div className="cardHeader">
                <h2>{t("browserArStream")}</h2>
                <span className="status">{effectLabels[effect]}</span>
              </div>

              <BrowserArStream
                ref={browserArRef}
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
              visionEnabled={cameraRecognition.featureEnabled}
              visionDetection={cameraRecognition.detection}
              activeVisionProduct={activeVisionProduct}
              onMarkCameraProduct={() => setCameraProductId(pinnedProductId)}
              onClearCameraProduct={() => setCameraProductId(null)}
              onRecognizeNow={() => {
                void cameraRecognition.recognizeNow();
              }}
              onApplyVisionContext={cameraRecognition.applyDetectionAsContext}
              onClearVisionContext={cameraRecognition.clearVisionContext}
            />
          </div>

          <ProductCatalogPanel
            compact
            variant="host"
            pinnedProductId={pinnedProductId}
            onPinProduct={handlePinProduct}
          />

          <ProductCatalogPanel
            variant="store"
            onAddToCart={(productId) => {
              cart.addProductById(productId);
            }}
          />

          <SalesAssistantPanel
            events={salesEvents}
            analytics={salesAnalytics}
            sessionCommentCount={sessionMessageCount}
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
        </div>

        <ChatPanel
          ref={chatPanelRef}
          key={liveSessionKey}
          roomId={DEMO_ROOM_ID}
          author={HOST_USERNAME}
          sessionKey={liveSessionKey}
          mlIntentBadgesByMessageId={mlIntentBadgesByMessageId}
          onViewerMessageSent={handleViewerMessageSent}
          onCommerceAction={cart.applySuggestedAction}
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

function StartLiveIcon() {
  return (
    <svg className="streamControlIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"
        fill="currentColor"
      />
    </svg>
  );
}

function StopLiveIcon() {
  return (
    <svg className="streamControlIcon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    </svg>
  );
}
