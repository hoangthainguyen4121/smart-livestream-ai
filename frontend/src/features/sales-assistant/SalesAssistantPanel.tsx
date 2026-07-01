import { getActionLabel, getIntentLabel } from "./processSalesComment";
import type { CommerceSuggestedAction } from "../commerce/commerceTypes";
import { getProductById } from "../product-catalog/productCatalogService";
import { PRODUCT_CONTEXT_SOURCE_LABELS } from "../sales-nlp/productContextResolver";
import { generateSalesRecommendations } from "./salesRecommendations";
import { AI_SALES_ASSISTANT_ACTOR } from "./salesAssistantTypes";
import type { SalesAssistantAnalytics, SalesAssistantEvent } from "./salesAssistantTypes";

type SalesAssistantPanelProps = {
  events: SalesAssistantEvent[];
  analytics: SalesAssistantAnalytics;
  onCommerceAction?: (action: CommerceSuggestedAction) => void;
};

export function SalesAssistantPanel({
  events,
  analytics,
  onCommerceAction,
}: SalesAssistantPanelProps) {
  const mostAskedProduct = analytics.mostAskedProductId
    ? getProductById(analytics.mostAskedProductId)
    : undefined;
  const recommendations = generateSalesRecommendations(analytics);

  return (
    <section className="salesAssistantPanel videoCard" aria-label="AI Sales Assistant">
      <div className="cardHeader">
        <h2>AI Sales Assistant</h2>
        <span className="status">{AI_SALES_ASSISTANT_ACTOR}</span>
      </div>

      <div className="salesAnalyticsGrid">
        <div className="salesAnalyticsItem">
          <span>Product questions</span>
          <strong>{analytics.totalProductQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Price</span>
          <strong>{analytics.priceQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Stock</span>
          <strong>{analytics.stockQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Color</span>
          <strong>{analytics.colorQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Link</span>
          <strong>{analytics.linkRequests}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Purchase intent</span>
          <strong>{analytics.purchaseIntentCount}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>Hot leads</span>
          <strong>{analytics.hotLeads}</strong>
        </div>
        <div className="salesAnalyticsItem salesAnalyticsWide">
          <span>Most asked product</span>
          <strong>{mostAskedProduct?.name ?? "—"}</strong>
        </div>
      </div>

      <div className="salesRecommendations">
        <h3>AI recommendation</h3>
        <ul>
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ul>
      </div>

      <div className="salesAssistantEvents">
        <h3>Detected events</h3>
        {events.length === 0 ? (
          <p className="emptyState">
            Gửi câu hỏi mua hàng trong chat để xem intent, confidence và gợi ý trả lời.
          </p>
        ) : (
          <div className="salesAssistantEventList">
            {events.map((event) => (
              <article
                className={
                  event.isComplaintEscalation
                    ? "salesAssistantEventItem salesAssistantEventItemComplaint"
                    : event.isPotentialBuyer
                      ? "salesAssistantEventItem salesAssistantEventItemEscalation"
                      : "salesAssistantEventItem"
                }
                key={event.id}
              >
                {event.isComplaintEscalation ? (
                  <p className="salesEscalationBanner">Complaint detected — escalate to host</p>
                ) : event.isPotentialBuyer ? (
                  <p className="salesEscalationBanner">Potential buyer detected — escalate to host</p>
                ) : null}

                <div className="salesAssistantEventMeta">
                  <span className="salesIntentBadge">{getIntentLabel(event.intent)}</span>
                  {event.mlRawIntent ? (
                    <span className="salesMlIntentBadge">
                      ML: {event.mlRawIntent}
                      {event.mlConfidence !== null
                        ? ` ${(event.mlConfidence * 100).toFixed(0)}%`
                        : ""}
                    </span>
                  ) : null}
                  <span className={`salesActionBadge salesActionBadge--${event.action}`}>
                    {getActionLabel(event.action)}
                  </span>
                  <span className="salesConfidenceBadge">
                    {(event.confidence * 100).toFixed(0)}%
                  </span>
                  <span className={`salesIntentSourceBadge salesIntentSourceBadge--${event.intentSource}`}>
                    {event.intentSource === "ml"
                      ? "PhoBERT"
                      : event.intentSource === "regex_fallback"
                        ? "rules fallback"
                        : "rules"}
                  </span>
                  <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                </div>

                <dl className="salesEventDetails">
                  <div>
                    <dt>Viewer</dt>
                    <dd>{event.viewerAuthor}</dd>
                  </div>
                  <div>
                    <dt>Comment</dt>
                    <dd>&quot;{event.viewerComment}&quot;</dd>
                  </div>
                  <div>
                    <dt>Intent</dt>
                    <dd>{getIntentLabel(event.intent)}</dd>
                  </div>
                  {event.mlRawIntent ? (
                    <div>
                      <dt>ML intent</dt>
                      <dd>
                        {event.mlRawIntent}
                        {event.mlConfidence !== null
                          ? ` (${event.mlConfidence.toFixed(2)})`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Intent source</dt>
                    <dd>{event.intentSource}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{event.confidence.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Action</dt>
                    <dd>{getActionLabel(event.action)}</dd>
                  </div>
                  <div>
                    <dt>Product</dt>
                    <dd>
                      {event.resolvedProductName} ({event.selectedProductId})
                    </dd>
                  </div>
                  <div>
                    <dt>Resolution</dt>
                    <dd>{event.resolutionSource}</dd>
                  </div>
                  <div>
                    <dt>Context source</dt>
                    <dd>{PRODUCT_CONTEXT_SOURCE_LABELS[event.contextSource]}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Context reason</dt>
                    <dd>{event.contextExplanation}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Product resolution</dt>
                    <dd>
                      <dl className="salesNestedDetails">
                        <div>
                          <dt>Resolution source</dt>
                          <dd>{event.resolutionSource}</dd>
                        </div>
                        <div>
                          <dt>Similarity</dt>
                          <dd>
                            {event.semanticSimilarity !== null
                              ? event.semanticSimilarity.toFixed(2)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Matched product</dt>
                          <dd>
                            {event.resolvedProductName} ({event.selectedProductId})
                          </dd>
                        </div>
                        {event.searchDiagnostics?.matchReasons.length ? (
                          <div>
                            <dt>Match reason</dt>
                            <dd>{event.searchDiagnostics.matchReasons.join(", ")}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </dd>
                  </div>
                  <div>
                    <dt>Product confidence</dt>
                    <dd>{event.productConfidence.toFixed(2)}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Matched products</dt>
                    <dd>{event.matchedProducts.join(", ") || "—"}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Entities</dt>
                    <dd>{formatEntities(event.entities)}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Matched patterns</dt>
                    <dd>{event.matchedPatterns.join(", ") || "—"}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>Suggested reply</dt>
                    <dd>{event.suggestedReply}</dd>
                  </div>
                  {event.commerceActions.length > 0 ? (
                    <div className="salesEventDetailsWide">
                      <dt>Commerce actions</dt>
                      <dd className="commerceActionRow">
                        {event.commerceActions.map((action) => (
                          <button
                            key={`${event.id}-${action.id}`}
                            type="button"
                            className="commerceActionButton"
                            onClick={() => onCommerceAction?.(action)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEntities(entities: SalesAssistantEvent["entities"]): string {
  const parts = [
    entities.colors.length ? `colors: ${entities.colors.join(", ")}` : null,
    entities.sizes.length ? `sizes: ${entities.sizes.join(", ")}` : null,
    entities.quantity ? `qty: ${entities.quantity}` : null,
    entities.shippingLocation ? `ship: ${entities.shippingLocation}` : null,
    entities.mentionedProductIds.length
      ? `products: ${entities.mentionedProductIds.join(", ")}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "—";
}
