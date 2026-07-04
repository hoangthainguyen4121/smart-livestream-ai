import type { CommerceSuggestedAction } from "../commerce/commerceTypes";
import { formatIntentLabel } from "../sales-nlp/formatChatIntentLabel";
import { useI18n } from "../../i18n/I18nProvider";
import {
  getActionDisplayLabel,
  getContextSourceDisplayLabel,
  getIntentDisplayLabel,
  getIntentSourceDisplayLabel,
} from "./salesAssistantLabels";
import { getTopAskedProducts } from "./salesAnalyticsHelpers";
import { generateSalesRecommendations } from "./salesRecommendations";
import { getExplanationWarningKey } from "./salesExplanationUi";
import { hasLimeTokenBars } from "./modelExplanationResolver";
import { ModelExplanationBars } from "./ModelExplanationBars";
import { ModelExplanationTopLabels } from "./ModelExplanationTopLabels";
import { SalesDecisionTimeline } from "./SalesDecisionTimeline";
import {
  buildDecisionTimeline,
  buildPredictionInterpretation,
  getClarificationQuestion,
  getDisplayResolvedProduct,
  getExplainableContextDisplayLabel,
} from "./salesExplainDisplay";
import { AI_SALES_ASSISTANT_ACTOR } from "./salesAssistantTypes";
import type { SalesAssistantAnalytics, SalesAssistantEvent } from "./salesAssistantTypes";

type SalesAssistantPanelProps = {
  events: SalesAssistantEvent[];
  analytics: SalesAssistantAnalytics;
  sessionCommentCount?: number;
  onCommerceAction?: (action: CommerceSuggestedAction) => void;
};

export function SalesAssistantPanel({
  events,
  analytics,
  sessionCommentCount = 0,
  onCommerceAction,
}: SalesAssistantPanelProps) {
  const { t, locale } = useI18n();
  const topProducts = getTopAskedProducts(analytics, 5);
  const recommendations = generateSalesRecommendations(analytics, locale);

  return (
    <section className="salesAssistantPanel videoCard" aria-label={t("aiSalesAssistant")}>
      <div className="cardHeader">
        <h2>{t("aiSalesAssistant")}</h2>
        <span className="status">{AI_SALES_ASSISTANT_ACTOR}</span>
      </div>

      <div className="salesAnalyticsGrid">
        <div className="salesAnalyticsItem">
          <span>{t("sessionComments")}</span>
          <strong>{sessionCommentCount}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("productQuestions")}</span>
          <strong>{analytics.totalProductQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("needsClarification")}</span>
          <strong>{analytics.clarificationCount + analytics.unknownComments}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("price")}</span>
          <strong>{analytics.priceQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("stock")}</span>
          <strong>{analytics.stockQuestions}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("link")}</span>
          <strong>{analytics.linkRequests}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("purchaseIntent")}</span>
          <strong>{analytics.purchaseIntentCount}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("hotLeads")}</span>
          <strong>{analytics.hotLeads}</strong>
        </div>
        <div className="salesAnalyticsItem">
          <span>{t("complaints")}</span>
          <strong>{analytics.complaintCount}</strong>
        </div>
      </div>

      <div className="salesTopProducts">
        <h3>{t("topAskedProducts")}</h3>
        {topProducts.length === 0 ? (
          <p className="emptyState">{t("topAskedProductsEmpty")}</p>
        ) : (
          <ol className="salesTopProductsList">
            {topProducts.map((entry, index) => (
              <li className="salesTopProductsItem" key={entry.productId}>
                <span className="salesTopProductsRank">#{index + 1}</span>
                <span className="salesTopProductsName">{entry.productName}</span>
                <strong>{entry.count}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="salesRecommendations">
        <h3>{t("hostRecommendations")}</h3>
        <ul>
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ul>
      </div>

      <div className="salesAssistantEvents">
        <h3>{t("recentActivity")}</h3>
        {events.length === 0 ? (
          <p className="emptyState">{t("emptyEventsHint")}</p>
        ) : (
          <div className="salesAssistantEventList">
            {events.slice(0, 8).map((event) => {
              const displayProduct = getDisplayResolvedProduct(event, t);
              const clarificationQuestion = getClarificationQuestion(event);
              const timelineSteps = buildDecisionTimeline(event, locale, t);
              const predictionInterpretation = buildPredictionInterpretation(
                event.explanation,
                event.mlConfidence,
                locale,
                t,
              );

              return (
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
                  <p className="salesEscalationBanner">{t("complaintBanner")}</p>
                ) : event.isPotentialBuyer ? (
                  <p className="salesEscalationBanner">{t("buyerBanner")}</p>
                ) : null}

                <div className="salesAssistantEventMeta">
                  <span className="salesIntentBadge">
                    {getIntentDisplayLabel(event.intent, locale)}
                  </span>
                  <span className={`salesActionBadge salesActionBadge--${event.action}`}>
                    {getActionDisplayLabel(event.action, locale)}
                  </span>
                  <span className="salesConfidenceBadge">
                    {(event.confidence * 100).toFixed(0)}%
                  </span>
                  <span className={`salesIntentSourceBadge salesIntentSourceBadge--${event.intentSource}`}>
                    {getIntentSourceDisplayLabel(event.intentSource, locale)}
                  </span>
                  <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                </div>

                <dl className="salesEventDetailsCompact">
                  <div>
                    <dt>{t("viewerLabel")}</dt>
                    <dd>{event.viewerAuthor}</dd>
                  </div>
                  <div>
                    <dt>{t("commentLabel")}</dt>
                    <dd>&quot;{event.viewerComment}&quot;</dd>
                  </div>
                  <div>
                    <dt>{t("productLabel")}</dt>
                    <dd>{displayProduct}</dd>
                  </div>
                  <div>
                    <dt>{t("contextLabel")}</dt>
                    <dd>{getContextSourceDisplayLabel(event.contextSource, locale)}</dd>
                  </div>
                  <div className="salesEventDetailsWide">
                    <dt>{t("suggestedReplyLabel")}</dt>
                    <dd>{event.suggestedReply}</dd>
                  </div>
                  {event.commerceActions.length > 0 ? (
                    <div className="salesEventDetailsWide">
                      <dt>{t("commerceActionsLabel")}</dt>
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

                <details className="salesExplainDetails">
                  <summary>{t("explainWhyTitle")}</summary>

                  <div className="salesExplainSection">
                    <h4 className="salesExplainSectionTitle">{t("explainTimelineTitle")}</h4>
                    <SalesDecisionTimeline steps={timelineSteps} />
                  </div>

                  <div className="salesExplainSection">
                    <h4 className="salesExplainSectionTitle">{t("explainLayerDecision")}</h4>
                    <dl className="salesExplainBody">
                      <div>
                        <dt>{t("explainFinalIntent")}</dt>
                        <dd>
                          {getIntentDisplayLabel(event.intent, locale)} ·{" "}
                          {getIntentSourceDisplayLabel(event.intentSource, locale)} ·{" "}
                          {(event.confidence * 100).toFixed(0)}%
                        </dd>
                      </div>
                      <div>
                        <dt>{t("explainIntentReason")}</dt>
                        <dd>{predictionInterpretation}</dd>
                      </div>
                      <div>
                        <dt>{t("explainContextSource")}</dt>
                        <dd>
                          {getExplainableContextDisplayLabel(event.explanation.contextSource, locale)}
                          {event.explanation.contextReason
                            ? ` — ${event.explanation.contextReason}`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("explainResolvedProduct")}</dt>
                        <dd>{displayProduct}</dd>
                      </div>
                      {clarificationQuestion ? (
                        <div className="salesEventDetailsWide">
                          <dt>{t("explainClarificationQuestion")}</dt>
                          <dd>{clarificationQuestion}</dd>
                        </div>
                      ) : null}
                      {event.explanation.productCandidates.length > 0 ? (
                        <div className="salesEventDetailsWide">
                          <dt>{t("explainProductCandidates")}</dt>
                          <dd>
                            {event.explanation.productCandidates
                              .slice(0, 3)
                              .map((candidate) => candidate.name)
                              .join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{t("explainAction")}</dt>
                        <dd>
                          {getActionDisplayLabel(event.action, locale)} — {event.explanation.actionReason}
                        </dd>
                      </div>
                      <div className="salesEventDetailsWide">
                        <dt>{t("explainReplyReason")}</dt>
                        <dd>{event.explanation.replyReason}</dd>
                      </div>
                    </dl>
                  </div>

                  {event.modelExplanation ? (
                    <div className="salesExplainSection">
                      <h4 className="salesExplainSectionTitle">{t("explainLayerModel")}</h4>
                      <dl className="salesExplainBody">
                        <div>
                          <dt>{t("explainModelPredicted")}</dt>
                          <dd>
                            {formatIntentLabel(event.modelExplanation.predictedLabel, t)} ·{" "}
                            {(event.modelExplanation.confidence * 100).toFixed(0)}%
                          </dd>
                        </div>
                        <div>
                          <dt>{t("explainModelTopLabels")}</dt>
                          <dd>
                            <ModelExplanationTopLabels
                              topLabels={event.modelExplanation.topLabels}
                              t={t}
                            />
                          </dd>
                        </div>
                        <div className="salesEventDetailsWide">
                          <dt>{t("explainPositiveTokens")}</dt>
                          <dd>
                            {event.modelExplanation.positiveFeatures.length > 0 ? (
                              <ModelExplanationBars
                                features={event.modelExplanation.positiveFeatures}
                                positive
                              />
                            ) : (
                              <span className="salesExplainNote">{t("none")}</span>
                            )}
                          </dd>
                        </div>
                        <div className="salesEventDetailsWide">
                          <dt>{t("explainNegativeTokens")}</dt>
                          <dd>
                            {event.modelExplanation.negativeFeatures.length > 0 ? (
                              <ModelExplanationBars
                                features={event.modelExplanation.negativeFeatures}
                                positive={false}
                              />
                            ) : (
                              <span className="salesExplainNote">{t("none")}</span>
                            )}
                          </dd>
                        </div>
                        {!hasLimeTokenBars(event.modelExplanation) ? (
                          <p className="salesExplainLimeUnavailable">{t("explainLimeUnavailable")}</p>
                        ) : event.modelExplanation.source === "lime_lookup" ? (
                          <p className="salesExplainNote">{t("explainLimeOfflineNote")}</p>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}

                  {(() => {
                    const warningKey = getExplanationWarningKey(
                      event.explanation,
                      event.mlConfidence,
                    );
                    return warningKey ? (
                      <p className="salesExplainWarning">{t(warningKey)}</p>
                    ) : null;
                  })()}
                </details>
              </article>
              );
            })}
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
