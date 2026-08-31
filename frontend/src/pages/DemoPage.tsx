import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel, type ChatPanelHandle } from "../components/ChatPanel";
import {
  endLiveSession,
  getCurrentLiveSession,
  reclaimHost,
  reportModerationViolation,
  startLiveSession,
} from "../api/liveSessions";
import {
  attachRoomProduct,
  createProduct,
  deleteProduct,
  getMyShop,
  getShop,
  listProducts,
  listRoomProducts,
  pinRoomProduct,
  updateProduct,
  type ProductInput,
} from "../api/commerce";
import { navigateHash, roomsPath } from "../routing/hashRoute";
import { AuthStatusPanel } from "../features/auth/AuthStatusPanel";
import { useOptionalAuth } from "../features/auth/useOptionalAuth";
import { BrowserArStream, type BrowserArStreamHandle } from "../features/browser-ar/components/BrowserArStream";
import {
  resolveStreamDisplayStatus,
  type VideoCaptureSource,
} from "../features/browser-ar/runtime/videoCaptureSource";
import { isLocalHostForRoom, markRoomAsHosted } from "../features/live-rooms/hostedRooms";
import {
  DEFAULT_ROOM_TYPE,
  getRoomTypeLabel,
  roomTypeRequiresCommerce,
} from "../features/live-rooms/roomTypes";
import {
  clearHostResumeToken,
  getHostResumeToken,
} from "../features/live-rooms/hostResumeToken";
import { useHostPresence } from "../features/live-rooms/useHostPresence";
import {
  resolveMediaIdlePlaceholder,
  resolveMediaStatusPresentation,
  resolveRoomSessionBadge,
} from "../features/live-rooms/roomPresentation";
import { useProductVisionRecognition } from "../features/hand-held-vision/useProductVisionRecognition";
import { ObjectDetectorDetectionList } from "../features/object-detector/ObjectDetectorDetectionList";
import { ObjectDetectorOverlay } from "../features/object-detector/ObjectDetectorOverlay";
import { useObjectDetectorOverlay } from "../features/object-detector/useObjectDetectorOverlay";
import { useSharpObjectEnforcement } from "../features/object-detector/useSharpObjectEnforcement";
import { useVisualModeration } from "../features/object-detector/useVisualModeration";
import { VisualModerationBanner } from "../features/object-detector/VisualModerationBanner";
import {
  VISUAL_VIOLATION_STRIKE_LIMIT,
  applyVisualViolationChannels,
  createVisualViolationStrikeState,
  isAdultViolationActive,
  isGunViolationActive,
  isSharpViolationActive,
  type VisualViolationStrikeState,
} from "../features/object-detector/visualViolationStrikes";
import { useAdultModeration } from "../features/adult-moderation/useAdultModeration";
import { useDemoGunDetector } from "../features/weapon-frame-gate/useDemoGunDetector";
import { WeaponDetectorOverlay } from "../features/weapon-frame-gate/WeaponDetectorOverlay";
import { type BrowserArEffect } from "../features/browser-ar/types";
import {
  CartDrawerButton,
  CartPanel,
  CheckoutModal,
  OrderSummary,
  useCommerceCart,
} from "../features/commerce";
import {
  mapArEffectTypeToBrowserAr,
  setActiveCatalog,
  type CatalogProduct,
} from "../features/product-catalog";
import { ProductCatalogPanel } from "../features/product-catalog/components/ProductCatalogPanel";
import { PinnedProductPanel } from "../features/sales-assistant/PinnedProductPanel";
import { buildAssistantChatMessage } from "../features/sales-assistant/assistantChatMessages";
import { processSalesCommentWithMl, shouldAutoReplyInChat } from "../features/sales-assistant/processSalesComment";
import type { ChatMlIntentBadge } from "../features/sales-nlp/mlIntentBridge";
import { buildCommentCorrectionContext } from "../features/intent-correction/buildCommentCorrectionContext";
import type { CommentCorrectionContext } from "../features/intent-correction/intentCorrectionTypes";
import { SalesAssistantPanel } from "../features/sales-assistant/SalesAssistantPanel";
import {
  createInitialAnalytics,
  type SalesAssistantAnalytics,
  type SalesAssistantEvent,
} from "../features/sales-assistant/salesAssistantTypes";
import { useI18n } from "../i18n/I18nProvider";
import { RemoteLiveVideo } from "../features/webrtc/RemoteLiveVideo";
import { useHostWebRtcPublisher } from "../features/webrtc/useHostWebRtcPublisher";
import { useViewerWebRtcPlayer } from "../features/webrtc/useViewerWebRtcPlayer";


const HOST_USERNAME = "hoang";
const GUEST_DISPLAY_NAME = "guest";
// Temporarily OFF by default. Set true only when sharp-object moderation is ready for demo.
const SHARP_OBJECT_MODERATION_ENABLED =
  import.meta.env.VITE_SHARP_OBJECT_MODERATION_ENABLED === "true";

const AR_EFFECTS: BrowserArEffect[] = ["none", "glasses", "makeup_lite", "full_filter"];

type DemoPageProps = {
  roomId: string;
};

export function DemoPage({ roomId }: DemoPageProps) {
  const { t, locale } = useI18n();
  const [roomName, setRoomName] = useState(roomId);
  const [roomLoadState, setRoomLoadState] = useState<"loading" | "ready" | "ended" | "error">(
    "loading",
  );
  const [roomLoadError, setRoomLoadError] = useState<string | null>(null);
  const [isStreamLive, setIsStreamLive] = useState(false);
  const [videoSource, setVideoSource] = useState<VideoCaptureSource>("camera");
  const [streamDurationSeconds, setStreamDurationSeconds] = useState(0);
  const [liveSessionKey, setLiveSessionKey] = useState(0);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [sessionTerminated, setSessionTerminated] = useState(false);
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);
  const [sessionViewerCount, setSessionViewerCount] = useState(0);
  const [sessionMessageCount, setSessionMessageCount] = useState(0);
  const [pinnedProductId, setPinnedProductId] = useState<string | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [roomShopId, setRoomShopId] = useState<string | null>(null);
  const [roomType, setRoomType] = useState(DEFAULT_ROOM_TYPE);
  const [attachedProductIds, setAttachedProductIds] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [effect, setEffect] = useState<BrowserArEffect>("none");
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [objectDetectorEnabled, setObjectDetectorEnabled] = useState(false);
  const [violationStrikes, setViolationStrikes] = useState<VisualViolationStrikeState>(
    createVisualViolationStrikeState,
  );
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const violationEndRequestedRef = useRef(false);
  const [salesEvents, setSalesEvents] = useState<SalesAssistantEvent[]>([]);
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAssistantAnalytics>(
    createInitialAnalytics(),
  );
  const [mlIntentBadgesByMessageId, setMlIntentBadgesByMessageId] = useState<
    Record<string, ChatMlIntentBadge>
  >({});
  const [correctionContextByMessageId, setCorrectionContextByMessageId] = useState<
    Record<string, CommentCorrectionContext>
  >({});
  const [submittedCorrectionMessageIds, setSubmittedCorrectionMessageIds] = useState<
    Record<string, boolean>
  >({});
  const auth = useOptionalAuth();
  const [isHost, setIsHost] = useState(
    () => isLocalHostForRoom(roomId) || Boolean(getHostResumeToken(roomId)),
  );
  const isCommerceRoom = roomTypeRequiresCommerce(roomType);
  const salesAnalyticsRef = useRef(salesAnalytics);
  const isStreamLiveRef = useRef(isStreamLive);
  const sessionTerminatedRef = useRef(sessionTerminated);
  const sessionViewerAuthorsRef = useRef<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const browserArRef = useRef<BrowserArStreamHandle | null>(null);
  const chatPanelRef = useRef<ChatPanelHandle | null>(null);

  salesAnalyticsRef.current = salesAnalytics;
  isStreamLiveRef.current = isStreamLive;
  sessionTerminatedRef.current = sessionTerminated;

  const effectLabels = useMemo(
    () => ({
      none: t("effectNone"),
      glasses: t("effectGlasses"),
      makeup_lite: t("effectMakeupLite"),
      full_filter: t("effectFullFilter"),
    }),
    [t],
  );

  const streamDisplayStatus = resolveStreamDisplayStatus(isStreamLive, videoSource);
  const roomBadge = resolveRoomSessionBadge(sessionTerminated ? "ended" : "active");
  const mediaIdlePlaceholder = t(resolveMediaIdlePlaceholder(isHost));

  useHostWebRtcPublisher({
    roomId,
    isHost: isHost && roomLoadState === "ready" && !sessionTerminated,
    mediaEnabled: isStreamLive,
    getCanvas: () => browserArRef.current?.getCanvasElement() ?? null,
    getSourceStream: () => browserArRef.current?.getSourceMediaStream() ?? null,
  });

  useHostPresence({
    roomId,
    sessionId: liveSessionId,
    enabled: isHost && roomLoadState === "ready" && !sessionTerminated,
    mediaLive: isStreamLive,
  });

  const viewerLive = useViewerWebRtcPlayer({
    roomId,
    enabled: !isHost && roomLoadState === "ready" && !sessionTerminated,
  });

  const mediaStatusLabel = isHost
    ? t(resolveMediaStatusPresentation(streamDisplayStatus).labelKey)
    : viewerLive.mediaState === "live"
      ? t("streamStatusCamera")
      : viewerLive.mediaState === "host_stopped"
        ? t("mediaHostStoppedPlaceholder")
        : t("mediaStatusIdle");

  const viewerPlaceholder = sessionTerminated
    ? t("roomsRoomEnded")
    : viewerLive.mediaState === "host_stopped"
      ? t("mediaHostStoppedPlaceholder")
      : t("mediaIdlePlaceholderViewer");

  const openCart = useCallback(() => {
    setCartOpen(true);
  }, []);

  const closeCart = useCallback(() => {
    setCartOpen(false);
  }, []);

  const cart = useCommerceCart({ onOpenCart: openCart, products: catalog, roomId });

  useEffect(() => {
    let cancelled = false;
    setRoomLoadState("loading");
    setRoomLoadError(null);

    void (async () => {
      try {
        const token = getHostResumeToken(roomId);
        if (token) {
          try {
            const reclaimed = await reclaimHost(roomId, token);
            if (cancelled) {
              return;
            }
            markRoomAsHosted(roomId);
            setIsHost(true);
            setLiveSessionId(reclaimed.id);
            setRoomShopId(reclaimed.shop_id ?? null);
            setRoomType(reclaimed.room_type ?? DEFAULT_ROOM_TYPE);
            setRoomName(reclaimed.name?.trim() || roomId);
            setSessionTerminated(false);
            setRoomLoadState("ready");
            return;
          } catch {
            // Token invalid or lease expired — fall through as viewer/ended.
            clearHostResumeToken(roomId);
            setIsHost(false);
          }
        } else {
          setIsHost(isLocalHostForRoom(roomId));
        }

        const session = await getCurrentLiveSession(roomId);
        if (cancelled) {
          return;
        }
        if (!session) {
          setRoomLoadState("ended");
          setLiveSessionId(null);
          return;
        }
        setLiveSessionId(session.id);
        setRoomShopId(session.shop_id ?? null);
        setRoomType(session.room_type ?? DEFAULT_ROOM_TYPE);
        setRoomName(session.name?.trim() || roomId);
        setSessionTerminated(false);
        setRoomLoadState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRoomLoadState("error");
        setRoomLoadError(
          error instanceof Error ? error.message : t("roomsRoomLoadError"),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, t]);

  const pinnedProduct = useMemo(
    () => (pinnedProductId ? catalog.find((product) => product.id === pinnedProductId) ?? null : null),
    [catalog, pinnedProductId],
  );

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    if (!isCommerceRoom) {
      setCatalog([]);
      setShopId(null);
      setShopName(null);
      setAttachedProductIds(new Set());
      setPinnedProductId(null);
      setCatalogLoading(false);
      return undefined;
    }
    void (async () => {
      try {
        if (isHost && auth.user) {
          const shop = await getMyShop();
          if (!shop) {
            if (!cancelled) {
              setShopId(null);
              setCatalog([]);
              setShopName(null);
            }
            return;
          }
          const [products, roomProducts] = await Promise.all([
            listProducts({ shopId: shop.id }),
            listRoomProducts(roomId),
          ]);
          if (!cancelled) {
            setShopId(shop.id);
            setShopName(shop.name);
            setCatalog(products);
            setAttachedProductIds(new Set(roomProducts.map((product) => product.id)));
            setPinnedProductId(
              roomProducts.find((product) => product.isPinned)?.id ?? null,
            );
          }
        } else {
          const [products, roomShop] = await Promise.all([
            listRoomProducts(roomId),
            roomShopId ? getShop(roomShopId) : Promise.resolve(null),
          ]);
          if (!cancelled) {
            setCatalog(products);
            setShopName(roomShop?.name ?? null);
            setAttachedProductIds(new Set(products.map((product) => product.id)));
            const pinned = products.find((product) => product.isPinned)?.id ?? products[0]?.id ?? null;
            setPinnedProductId(pinned);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setCatalog([]);
          setPinnedProductId(null);
          setCatalogError(
            error instanceof Error
              ? error.message
              : "Không thể tải sản phẩm của phòng. Hãy thử tải lại.",
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user, catalogRevision, isCommerceRoom, isHost, roomId, roomShopId]);

  useEffect(() => {
    setActiveCatalog(catalog);
    return () => setActiveCatalog(null);
  }, [catalog]);

  async function handleCreateProduct(input: ProductInput) {
    if (!shopId) throw new Error("Hãy thiết lập cửa hàng trước khi tạo sản phẩm.");
    const product = await createProduct(shopId, input);
    setCatalog((current) => [product, ...current]);
    return product;
  }

  async function handleUpdateProduct(product: (typeof catalog)[number], input: ProductInput) {
    const updated = await updateProduct(product.id, input);
    setCatalog((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    return updated;
  }

  async function handleDeleteProduct(product: (typeof catalog)[number]) {
    if (!window.confirm(`Ngừng bán “${product.name}”?`)) return;
    await deleteProduct(product.id);
    setCatalog((current) => current.filter((entry) => entry.id !== product.id));
    if (pinnedProductId === product.id) setPinnedProductId(null);
  }

  async function handleAttachProduct(productId: string) {
    await attachRoomProduct(roomId, productId);
    setAttachedProductIds((current) => new Set(current).add(productId));
  }

  const captureFrame = useCallback(() => browserArRef.current?.captureFrame() ?? null, []);
  const getVideoElement = useCallback(() => browserArRef.current?.getVideoElement() ?? null, []);
  const getCanvasElement = useCallback(() => browserArRef.current?.getCanvasElement() ?? null, []);

  const objectDetector = useObjectDetectorOverlay({
    enabled: objectDetectorEnabled && !sessionTerminated,
    isLive: isStreamLive && !sessionTerminated,
    videoSource,
    getCanvasElement,
  });

  const visualModeration = useVisualModeration({
    enabled: objectDetectorEnabled && !sessionTerminated,
    isActive: objectDetector.isActive && !sessionTerminated,
    detections: objectDetector.snapshot.allDetections,
    sharpLabels: SHARP_OBJECT_MODERATION_ENABLED ? undefined : [],
  });

  const applyBackendSessionEnded = useCallback((reason: string) => {
    setSessionTerminated(true);
    setIsStreamLive(false);
    setVideoSource("camera");
    setStreamDurationSeconds(0);
    setObjectDetectorEnabled(false);
    setLiveSessionId(null);
    setRoomLoadState("ended");
    setSessionStartError(
      reason === "visual_moderation_violation" ? null : reason,
    );
  }, []);

  const handleSharpObjectTerminate = useCallback(
    async (payload: {
      label: "knife" | "scissors";
      confidence: number;
      evidenceCount: number;
      windowMs: number;
    }) => {
      if (!liveSessionId) {
        return;
      }
      try {
        const ended = await reportModerationViolation(
          liveSessionId,
          {
            code: "sharp_object_detected",
            label: payload.label,
            confidence: payload.confidence,
            evidence_count: payload.evidenceCount,
            window_ms: payload.windowMs,
            detected_at: new Date().toISOString(),
          },
          getHostResumeToken(roomId),
        );
        applyBackendSessionEnded(ended.ended_reason ?? "visual_moderation_violation");
      } catch (error) {
        setSessionStartError(
          error instanceof Error ? error.message : t("visualModerationTerminateFailed"),
        );
      }
    },
    [applyBackendSessionEnded, liveSessionId, roomId, t],
  );

  const sharpObjectEnforcement = useSharpObjectEnforcement({
    enabled:
      SHARP_OBJECT_MODERATION_ENABLED &&
      objectDetectorEnabled &&
      !sessionTerminated,
    isActive: objectDetector.isActive && !sessionTerminated,
    detections: objectDetector.snapshot.allDetections,
    snapshotUpdatedAt: objectDetector.snapshot.updatedAt,
    sessionId: liveSessionId,
    terminated: sessionTerminated,
    onTerminate: (payload) => {
      void handleSharpObjectTerminate(payload);
    },
  });

  // Adult moderation: suggestive (viddexa) + Falconsai explicit — warning only.
  const adultGate = useAdultModeration({
    enabled: objectDetectorEnabled && !sessionTerminated,
    isLive: isStreamLive && !sessionTerminated,
    getCanvasElement,
  });

  // Gun: Subh775 ONNX → YOLOX → DINO (local/thesis). YOLOX A/B only — live boxes noisy @0.02.
  const weaponGate = useDemoGunDetector({
    enabled: objectDetectorEnabled && !sessionTerminated,
    isLive: isStreamLive && !sessionTerminated,
    getCanvasElement,
  });

  useEffect(() => {
    if (!objectDetectorEnabled || sessionTerminated) {
      setViolationStrikes(createVisualViolationStrikeState());
      violationEndRequestedRef.current = false;
      return undefined;
    }

    const readChannels = () => ({
      adult: isAdultViolationActive(adultGate.result.state),
      gun: isGunViolationActive(weaponGate.result.state),
      sharp:
        SHARP_OBJECT_MODERATION_ENABLED &&
        isSharpViolationActive(sharpObjectEnforcement.result.action),
    });

    const tick = () => {
      const nextChannels = readChannels();
      setViolationStrikes((previous) =>
        applyVisualViolationChannels(previous, nextChannels, Date.now(), {
          evidenceCounts: {
            adult: adultGate.result.evidenceCount,
            gun: weaponGate.result.evidenceCount,
            sharp: sharpObjectEnforcement.result.evidenceCount,
          },
        }),
      );
    };

    tick();
    const intervalId = window.setInterval(tick, 500);
    return () => window.clearInterval(intervalId);
  }, [
    objectDetectorEnabled,
    sessionTerminated,
    adultGate.result.state,
    adultGate.result.evidenceCount,
    weaponGate.result.state,
    weaponGate.result.evidenceCount,
    sharpObjectEnforcement.result.action,
    sharpObjectEnforcement.result.evidenceCount,
  ]);

  const cameraRecognition = useProductVisionRecognition({
    roomId,
    enabled: isHost && isCommerceRoom,
    isLive: isStreamLive && videoSource === "camera",
    catalog,
    captureFrame,
    getVideoElement,
  });

  const chatAuthor = auth.user?.displayName ?? GUEST_DISPLAY_NAME;

  const resetLiveSessionState = useCallback(() => {
    sessionViewerAuthorsRef.current = new Set();
    setSessionViewerCount(0);
    setSessionMessageCount(0);
    setSalesAnalytics(createInitialAnalytics());
    setSalesEvents([]);
    setMlIntentBadgesByMessageId({});
    setCorrectionContextByMessageId({});
    setSubmittedCorrectionMessageIds({});
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

  async function handlePinProduct(productId: string) {
    const product = catalog.find((entry) => entry.id === productId);
    if (!product) {
      return;
    }
    setPinnedProductId(productId);
    await attachRoomProduct(roomId, productId);
    setAttachedProductIds((current) => new Set(current).add(productId));
    await pinRoomProduct(roomId, productId);
    if (!isStreamLive) {
      setEffect(mapArEffectTypeToBrowserAr(product.arEffectType));
    }
  }

  function handleUnpinProduct() {
    setPinnedProductId(null);
    void pinRoomProduct(roomId, null);
  }

  async function ensureLiveSessionStarted() {
    if (liveSessionId && !sessionTerminated) {
      return liveSessionId;
    }
    const session = await startLiveSession(roomId);
    if (session.status !== "active") {
      throw new Error(t("visualModerationSessionNotActive"));
    }
    setLiveSessionId(session.id);
    setSessionTerminated(false);
    setSessionStartError(null);
    return session.id;
  }

  async function handleStartCamera() {
    if (!isHost || sessionTerminated) {
      return;
    }
    if (!isStreamLive) {
      resetLiveSessionState();
      setStreamDurationSeconds(0);
    }
    try {
      await ensureLiveSessionStarted();
      setVideoSource("camera");
      setIsStreamLive(true);
      setSessionTerminated(false);
    } catch (error) {
      setSessionStartError(
        error instanceof Error ? error.message : t("visualModerationSessionStartFailed"),
      );
    }
  }

  async function handleShareScreen() {
    if (!isHost || sessionTerminated) {
      return;
    }
    if (!isStreamLive) {
      resetLiveSessionState();
      setStreamDurationSeconds(0);
    }
    try {
      await ensureLiveSessionStarted();
      setVideoSource("screen");
      setIsStreamLive(true);
      setSessionTerminated(false);
    } catch (error) {
      setSessionStartError(
        error instanceof Error ? error.message : t("visualModerationSessionStartFailed"),
      );
    }
  }

  function handleStopSharing() {
    if (sessionTerminated || !isHost) {
      return;
    }
    if (isStreamLive && videoSource === "screen") {
      setVideoSource("camera");
    }
  }

  /** Stops local MediaStream only. Room/session stays ACTIVE. */
  function handleStopMedia() {
    if (sessionTerminated || !isHost) {
      return;
    }
    setIsStreamLive(false);
    setVideoSource("camera");
    setStreamDurationSeconds(0);
    setObjectDetectorEnabled(false);
  }

  /** Explicitly ends backend livestream session. */
  const handleEndLivestream = useCallback(
    (options?: { deferEndedUi?: boolean }) => {
      if (!isHost || sessionTerminated) {
        return;
      }
      const deferEndedUi = options?.deferEndedUi === true;
      const sessionId = liveSessionId;
      setIsStreamLive(false);
      setVideoSource("camera");
      setStreamDurationSeconds(0);
      setObjectDetectorEnabled(false);
      if (!sessionId) {
        setSessionTerminated(true);
        if (!deferEndedUi) {
          setRoomLoadState("ended");
        }
        return;
      }
      void endLiveSession(sessionId, getHostResumeToken(roomId))
        .then(() => {
          clearHostResumeToken(roomId);
          setLiveSessionId(null);
          setSessionTerminated(true);
          if (!deferEndedUi) {
            setRoomLoadState("ended");
          }
          resetLiveSessionState();
        })
        .catch((error) => {
          setSessionStartError(
            error instanceof Error ? error.message : t("visualModerationTerminateFailed"),
          );
        });
    },
    [isHost, sessionTerminated, liveSessionId, roomId, resetLiveSessionState, t],
  );

  const dismissViolationModal = useCallback(() => {
    setViolationModalOpen(false);
    // After 5/5 popup, switch to the ended-room screen (stream already stopped).
    setRoomLoadState("ended");
  }, []);

  useEffect(() => {
    if (
      !violationStrikes.limitReached ||
      violationEndRequestedRef.current ||
      sessionTerminated ||
      !isHost
    ) {
      return;
    }
    violationEndRequestedRef.current = true;
    setViolationModalOpen(true);
    // Keep room UI mounted so the violation modal is visible until dismissed.
    handleEndLivestream({ deferEndedUi: true });
  }, [violationStrikes.limitReached, sessionTerminated, isHost, handleEndLivestream]);

  function handleBackToRooms() {
    setIsStreamLive(false);
    setVideoSource("camera");
    setObjectDetectorEnabled(false);
    navigateHash(roomsPath());
  }

  const handleLiveSessionEnded = useCallback(
    (payload: { reason: string; sessionId?: string }) => {
      applyBackendSessionEnded(payload.reason);
    },
    [applyBackendSessionEnded],
  );

  const handleScreenShareEnded = useCallback(() => {
    if (isStreamLiveRef.current) {
      setVideoSource("camera");
    }
  }, []);

  const handleStreamStartFailed = useCallback(() => {
    setIsStreamLive(false);
    setVideoSource("camera");
    setStreamDurationSeconds(0);
  }, []);

  const handleViewerMessageSent = useCallback(
    async ({
      messageId,
      author,
      text,
      createdAt,
    }: {
      messageId: string;
      author: string;
      text: string;
      createdAt: string;
    }) => {
      // Chat/NLP follow room session, not local camera media state.
      if (sessionTerminatedRef.current) {
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
          catalog,
          selectedCameraProductId: null,
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

      const correctionContext = buildCommentCorrectionContext(
        {
          id: messageId,
          room_id: roomId,
          author,
          text,
          created_at: createdAt,
        },
        result.mlResponse,
      );
      if (correctionContext) {
        setCorrectionContextByMessageId((current) => ({
          ...current,
          [messageId]: correctionContext,
        }));
      }

      setSalesAnalytics(result.analytics);

      if (!result.event) {
        return;
      }

      setSalesEvents((currentEvents) => [result.event!, ...currentEvents]);

      if (shouldAutoReplyInChat(result.event)) {
        const assistantMessage = buildAssistantChatMessage(result.event, {
          id: messageId,
          author,
          text,
          room_id: roomId,
        });
        chatPanelRef.current?.sendAssistantMessage(assistantMessage);
      }
    },
    [cameraRecognition.activeVisionProductId, cameraRecognition.detection.match, catalog, pinnedProduct, roomId],
  );

  if (roomLoadState === "loading") {
    return (
      <main className="page">
        <div className="liveRoomsState">
          <p>{t("roomsRoomLoading")}</p>
        </div>
      </main>
    );
  }

  if (roomLoadState === "ended" || roomLoadState === "error") {
    return (
      <main className="page">
        <div className="liveRoomsState">
          <h1>{roomName}</h1>
          <p>{roomLoadState === "ended" ? t("roomsRoomEnded") : roomLoadError}</p>
          <button type="button" className="liveRoomsCreateButton" onClick={handleBackToRooms}>
            {t("roomsBackToList")}
          </button>
        </div>
        {violationModalOpen ? (
          <div className="liveRoomsModalBackdrop" role="presentation">
            <div
              className="liveRoomsModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="visual-violation-modal-title"
            >
              <h2 id="visual-violation-modal-title">{t("visualViolationModalTitle")}</h2>
              <p>
                {t("visualViolationModalBody", {
                  limit: VISUAL_VIOLATION_STRIKE_LIMIT,
                })}
              </p>
              <div className="liveRoomsModalActions">
                <button
                  type="button"
                  className="liveRoomsCreateButton"
                  onClick={dismissViolationModal}
                >
                  {t("visualViolationModalConfirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="page">
      <section className="livestreamShell">
        <div className="streamMain">
          <header className="streamHeader">
            <div className="streamHeaderMain">
              <p className="eyebrow">{t("appEyebrow")}</p>
              <h1>{roomName}</h1>
              <p className="streamMeta">
                {isCommerceRoom
                  ? shopName
                    ? `Shop ${shopName}`
                    : "Đang tải thông tin shop…"
                  : getRoomTypeLabel(roomType, locale)} ·{" "}
                {isHost
                  ? `Host ${auth.user?.displayName ?? HOST_USERNAME}`
                  : "Bạn đang xem với vai trò khách"}
              </p>
              <div className="streamHeaderActions">
                <button type="button" className="streamControlButton" onClick={handleBackToRooms}>
                  <RoomsListIcon />
                  {t("roomsBackToList")}
                </button>
                {isHost ? (
                  <>
                    <div className="streamControlGroup" role="group" aria-label={t("startCamera")}>
                      <button
                        type="button"
                        className="streamControlButton streamControlButtonPrimary"
                        onClick={() => {
                          void handleStartCamera();
                        }}
                        disabled={sessionTerminated || (isStreamLive && videoSource === "camera")}
                      >
                        <StartLiveIcon />
                        {t("startCamera")}
                      </button>
                      <button
                        type="button"
                        className="streamControlButton"
                        onClick={handleStopMedia}
                        disabled={sessionTerminated || !isStreamLive}
                      >
                        {t("stopMedia")}
                      </button>
                    </div>
                    <div className="streamControlGroup" role="group" aria-label={t("shareScreen")}>
                      <button
                        type="button"
                        className="streamControlButton"
                        onClick={() => {
                          void handleShareScreen();
                        }}
                        disabled={sessionTerminated || (isStreamLive && videoSource === "screen")}
                      >
                        {t("shareScreen")}
                      </button>
                      <button
                        type="button"
                        className="streamControlButton"
                        onClick={handleStopSharing}
                        disabled={sessionTerminated || !isStreamLive || videoSource !== "screen"}
                      >
                        {t("stopSharing")}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="streamControlButton streamControlButtonStop"
                      onClick={() => handleEndLivestream()}
                      disabled={sessionTerminated}
                    >
                      <StopLiveIcon />
                      {t("stopStream")}
                    </button>
                  </>
                ) : null}
              </div>
              <p className="streamRoleHint">{isHost ? t("hostControlsHint") : t("viewerControlsHint")}</p>
            </div>
            <div className="streamStats">
              <span className={roomBadge.className}>{t(roomBadge.labelKey)}</span>
              <span className="streamSourceStatus">{mediaStatusLabel}</span>
              <span>{t("viewers", { count: sessionViewerCount })}</span>
              <span>{t("messages", { count: sessionMessageCount })}</span>
              <span>{formatDuration(streamDurationSeconds)}</span>
            </div>
          </header>

          {isHost ? (
            <section className="modeToggle" aria-label="Stream actions">
              {AR_EFFECTS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={effect === entry ? "active" : ""}
                  onClick={() => setEffect(entry)}
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
              <button
                type="button"
                className={objectDetectorEnabled ? "active" : ""}
                onClick={() => setObjectDetectorEnabled((value) => !value)}
                disabled={sessionTerminated || !isStreamLive}
              >
                {t("objectDetectorOverlay")}
              </button>
            </section>
          ) : null}

          <div className="streamMediaRow">
            <div className="videoCard">
              <div className="cardHeader">
                <h2>{t("browserArStream")}</h2>
                <span className="status">{effectLabels[effect]}</span>
              </div>

              <div className="browserArStreamWrap">
                {isHost ? (
                  <>
                    <BrowserArStream
                      ref={browserArRef}
                      isLive={isStreamLive}
                      videoSource={videoSource}
                      effect={effect}
                      debugOverlay={debugOverlay}
                      hostLabel={`@${HOST_USERNAME}`}
                      idlePlaceholder={mediaIdlePlaceholder}
                      onScreenShareEnded={handleScreenShareEnded}
                      onStreamStartFailed={handleStreamStartFailed}
                    />
                    <ObjectDetectorOverlay
                      enabled={objectDetector.isActive}
                      snapshot={objectDetector.snapshot}
                      getSourceCanvas={getCanvasElement}
                    />
                    <WeaponDetectorOverlay
                      enabled={
                        weaponGate.uiEnabled &&
                        isStreamLive &&
                        !sessionTerminated &&
                        weaponGate.lastDetections.some((d) =>
                          ["gun", "pistol", "rifle", "firearm"].includes(d.label),
                        )
                      }
                      detections={weaponGate.lastDetections.filter((d) =>
                        ["gun", "pistol", "rifle", "firearm"].includes(d.label),
                      )}
                      getSourceCanvas={getCanvasElement}
                    />
                  </>
                ) : viewerLive.remoteStream ? (
                  <RemoteLiveVideo stream={viewerLive.remoteStream} />
                ) : (
                  <div className="streamPlaceholder">{viewerPlaceholder}</div>
                )}
              </div>
              {isHost && objectDetectorEnabled && objectDetector.isLoading ? (
                <p className="browserArHint">{t("objectDetectorLoading")}</p>
              ) : null}
              {isHost && objectDetector.errorMessage ? (
                <p className="error">{objectDetector.errorMessage}</p>
              ) : null}
              {isHost ? (
                <ObjectDetectorDetectionList
                  enabled={objectDetectorEnabled}
                  status={objectDetector.status}
                  snapshot={objectDetector.snapshot}
                />
              ) : null}
              {sessionStartError ? <p className="error">{sessionStartError}</p> : null}
              {isHost ? (
                <VisualModerationBanner
                  enabled={objectDetectorEnabled || sessionTerminated}
                  result={visualModeration}
                  enforcement={sharpObjectEnforcement.result}
                  adultGate={adultGate}
                  weaponGate={weaponGate}
                  terminated={sessionTerminated}
                  violationStrikeCount={violationStrikes.count}
                  violationStrikeLimit={VISUAL_VIOLATION_STRIKE_LIMIT}
                  sharpModerationEnabled={SHARP_OBJECT_MODERATION_ENABLED}
                />
              ) : null}
            </div>

            {isCommerceRoom ? (
              <PinnedProductPanel
                product={pinnedProduct}
                onUnpin={isHost ? handleUnpinProduct : undefined}
              />
            ) : null}
          </div>

          {isHost && isCommerceRoom ? (
            <>
              <div className="hostProductGuide" role="status">
                <strong>Sản phẩm trong livestream</strong>
                <span>
                  Gắn sản phẩm vào phòng trước, sau đó chọn một sản phẩm để ghim nổi bật cho người xem.
                </span>
              </div>
              {catalogLoading ? <p className="emptyState">Đang tải sản phẩm của shop…</p> : null}
              {catalogError ? <p className="error">{catalogError}</p> : null}
              {!catalogLoading ? (
                <ProductCatalogPanel
                  compact
                  variant="host"
                  titleOverride={`Sản phẩm của ${shopName ?? "shop"}`}
                  products={catalog}
                  onCreateProduct={handleCreateProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={(product) => void handleDeleteProduct(product)}
                  catalogRevision={catalogRevision}
                  attachedProductIds={attachedProductIds}
                  onAttachProduct={(productId) => void handleAttachProduct(productId)}
                  pinnedProductId={pinnedProductId ?? undefined}
                  onPinProduct={(productId) => void handlePinProduct(productId)}
                  onProductCreated={() => setCatalogRevision((revision) => revision + 1)}
                  emptyMessage="Shop chưa có sản phẩm. Hãy thêm sản phẩm trước khi livestream."
                />
              ) : null}
            </>
          ) : null}

          {!isHost && isCommerceRoom ? (
            <>
              {!auth.user ? (
                <p className="viewerCommerceNotice">
                  Bạn có thể xem sản phẩm ngay. Hãy đăng nhập ở khung bên phải trước khi checkout.
                </p>
              ) : null}
              {catalogLoading ? <p className="emptyState">Đang tải sản phẩm trong phòng…</p> : null}
              {catalogError ? <p className="error">{catalogError}</p> : null}
              {!catalogLoading ? (
                <ProductCatalogPanel
                  variant="store"
                  titleOverride={shopName ? `Sản phẩm từ ${shopName}` : "Sản phẩm trong phòng"}
                  products={catalog}
                  catalogRevision={catalogRevision}
                  emptyMessage="Host chưa gắn sản phẩm nào vào phòng này."
                  onAddToCart={(productId) => {
                    cart.addProductById(productId);
                  }}
                />
              ) : null}
            </>
          ) : null}

          {isHost && isCommerceRoom ? (
            <SalesAssistantPanel
              events={salesEvents}
              analytics={salesAnalytics}
              sessionCommentCount={sessionMessageCount}
              onCommerceAction={cart.applySuggestedAction}
            />
          ) : null}

          {!isHost && isCommerceRoom ? (
            <CartDrawerButton itemCount={cart.itemCount} onClick={openCart} />
          ) : null}
          {!isHost && isCommerceRoom ? (
            <>
              <CartPanel
                open={cartOpen}
                onClose={closeCart}
                items={cart.items}
                itemCount={cart.itemCount}
                subtotal={cart.subtotal}
                pinnedProductName={pinnedProduct?.name}
                onAddPinnedProduct={
                  pinnedProduct ? () => cart.addPinnedProduct(pinnedProduct) : undefined
                }
                onRemoveItem={cart.removeLine}
                onUpdateQuantity={cart.updateLineQuantity}
                onCheckout={() => {
                  closeCart();
                  cart.openCheckout();
                }}
                onClearCart={cart.clearCart}
              />

              <section className="commerceRow">
                <OrderSummary order={cart.order} isPaying={cart.isPaying} />
              </section>

              <CheckoutModal
                open={cart.checkoutOpen}
                items={cart.items}
                subtotal={cart.subtotal}
                form={cart.checkoutForm}
                onClose={cart.closeCheckout}
                onChange={cart.updateCheckoutField}
                submitting={cart.isPaying}
                error={cart.checkoutError}
                onSubmit={() => void cart.submitCheckout()}
              />
            </>
          ) : null}

          {violationModalOpen ? (
            <div className="liveRoomsModalBackdrop" role="presentation">
              <div
                className="liveRoomsModal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="visual-violation-modal-title"
              >
                <h2 id="visual-violation-modal-title">{t("visualViolationModalTitle")}</h2>
                <p>
                  {t("visualViolationModalBody", {
                    limit: VISUAL_VIOLATION_STRIKE_LIMIT,
                  })}
                </p>
                <div className="liveRoomsModalActions">
                  <button
                    type="button"
                    className="liveRoomsCreateButton"
                    onClick={dismissViolationModal}
                  >
                    {t("visualViolationModalConfirm")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="chatColumn">
          <AuthStatusPanel
            configured={auth.configured}
            loading={auth.loading}
            user={auth.user}
            error={auth.error}
            onLogin={auth.login}
            onRegister={auth.register}
            onGoogleLogin={auth.googleConfigured ? auth.loginWithGoogle : undefined}
            onLogout={() => {
              void auth.logout();
            }}
          />
          <ChatPanel
            ref={chatPanelRef}
            key={liveSessionKey}
            roomId={roomId}
            author={chatAuthor}
            displayNameLocked={Boolean(auth.user)}
            sessionKey={liveSessionKey}
            mlIntentBadgesByMessageId={mlIntentBadgesByMessageId}
            correctionContextByMessageId={correctionContextByMessageId}
            submittedCorrectionMessageIds={submittedCorrectionMessageIds}
            onCorrectionSubmitted={(messageId) => {
              setSubmittedCorrectionMessageIds((current) => ({
                ...current,
                [messageId]: true,
              }));
            }}
            onViewerMessageSent={handleViewerMessageSent}
            onCommerceAction={cart.applySuggestedAction}
            chatDisabled={sessionTerminated}
            onLiveSessionEnded={handleLiveSessionEnded}
          />
        </aside>
      </section>
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function RoomsListIcon() {
  return (
    <svg className="streamControlIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z"
        fill="currentColor"
      />
    </svg>
  );
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
