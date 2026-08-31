import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildApprovePayload,
  buildRejectPayload,
  listPendingIntentCorrections,
  reviewIntentCorrection,
  type IntentCorrectionListItem,
} from "../api/adminIntentCorrections";
import {
  createExportBatch,
  downloadExportArtifact,
  getReadyExportCount,
  type CreateExportBatchResponse,
} from "../api/adminDatasetExport";
import { formatIntentLabel } from "../features/sales-nlp/formatChatIntentLabel";
import { useI18n } from "../i18n/I18nProvider";
import { ML_INTENT_LABELS } from "../features/intent-correction/mlIntentLabels";
import {
  getAdminReviewerLabel,
  getConfiguredAdminApiKey,
  saveAdminApiKey,
  saveAdminReviewerLabel,
} from "../features/intent-correction-admin/adminAccess";

type ReviewState = {
  finalIntent: string;
  reviewNote: string;
  submitting: "approve" | "reject" | null;
  error: string | null;
  completed: boolean;
};

export function IntentCorrectionAdminPage() {
  const { t } = useI18n();
  const [apiKeyInput, setApiKeyInput] = useState(getConfiguredAdminApiKey() ?? "");
  const [reviewerInput, setReviewerInput] = useState(getAdminReviewerLabel() ?? "");
  const [items, setItems] = useState<IntentCorrectionListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewById, setReviewById] = useState<Record<string, ReviewState>>({});
  const [readyExportCount, setReadyExportCount] = useState<number | null>(null);
  const [exportBatch, setExportBatch] = useState<CreateExportBatchResponse | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const apiKey = getConfiguredAdminApiKey();

  const loadReadyExportCount = useCallback(async () => {
    if (!apiKey) {
      return;
    }
    try {
      const response = await getReadyExportCount(apiKey);
      setReadyExportCount(response.ready_count);
    } catch {
      setReadyExportCount(null);
    }
  }, [apiKey]);

  const loadPage = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!apiKey) {
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const response = await listPendingIntentCorrections(apiKey, {
          limit: 50,
          cursor: cursor ?? undefined,
        });
        setItems((current) => (append ? [...current, ...response.items] : response.items));
        setNextCursor(response.next_cursor);
        setReviewById((current) => {
          const next = append ? { ...current } : {};
          for (const item of response.items) {
            if (!next[item.id]) {
              next[item.id] = {
                finalIntent: item.proposed_intent,
                reviewNote: "",
                submitting: null,
                error: null,
                completed: false,
              };
            }
          }
          return next;
        });
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : t("adminIntentReviewLoadError"));
      } finally {
        setLoading(false);
      }
    },
    [apiKey, t],
  );

  useEffect(() => {
    void loadPage();
    void loadReadyExportCount();
  }, [loadPage, loadReadyExportCount]);

  async function handleCreateExportBatch() {
    if (!apiKey || exportLoading) {
      return;
    }
    setExportLoading(true);
    setExportError(null);
    try {
      const created = await createExportBatch(apiKey);
      setExportBatch(created);
      await loadReadyExportCount();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("adminExportCreateError"));
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDownload(kind: "jsonl" | "manifest") {
    if (!apiKey || !exportBatch) {
      return;
    }
    const { blob, filename } = await downloadExportArtifact(apiKey, exportBatch.id, kind);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasConfiguredAccess = Boolean(apiKey);

  async function handleApprove(item: IntentCorrectionListItem) {
    if (!apiKey) {
      return;
    }
    const state = reviewById[item.id];
    if (!state?.finalIntent || state.submitting) {
      return;
    }

    setReviewById((current) => ({
      ...current,
      [item.id]: { ...state, submitting: "approve", error: null },
    }));

    try {
      await reviewIntentCorrection(
        apiKey,
        item.id,
        buildApprovePayload(state.finalIntent, state.reviewNote),
        reviewerInput || undefined,
      );
      setItems((current) => current.filter((row) => row.id !== item.id));
      setReviewById((current) => ({
        ...current,
        [item.id]: { ...state, submitting: null, completed: true },
      }));
      await loadReadyExportCount();
    } catch (error) {
      setReviewById((current) => ({
        ...current,
        [item.id]: {
          ...state,
          submitting: null,
          error: error instanceof Error ? error.message : t("adminIntentReviewActionError"),
        },
      }));
    }
  }

  async function handleReject(item: IntentCorrectionListItem) {
    if (!apiKey) {
      return;
    }
    const state = reviewById[item.id];
    if (!state || state.submitting) {
      return;
    }

    setReviewById((current) => ({
      ...current,
      [item.id]: { ...state, submitting: "reject", error: null },
    }));

    try {
      await reviewIntentCorrection(
        apiKey,
        item.id,
        buildRejectPayload(state.reviewNote),
        reviewerInput || undefined,
      );
      setItems((current) => current.filter((row) => row.id !== item.id));
      setReviewById((current) => ({
        ...current,
        [item.id]: { ...state, submitting: null, completed: true },
      }));
    } catch (error) {
      setReviewById((current) => ({
        ...current,
        [item.id]: {
          ...state,
          submitting: null,
          error: error instanceof Error ? error.message : t("adminIntentReviewActionError"),
        },
      }));
    }
  }

  const intentOptions = useMemo(
    () =>
      ML_INTENT_LABELS.map((intent) => ({
        value: intent,
        label: formatIntentLabel(intent, t),
      })),
    [t],
  );

  if (!hasConfiguredAccess) {
    return (
      <main className="adminIntentReviewPage">
        <h1>{t("adminIntentReviewTitle")}</h1>
        <p>{t("adminIntentReviewAccessHint")}</p>
        <label className="adminIntentReviewField">
          <span>{t("adminIntentReviewApiKey")}</span>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
          />
        </label>
        <label className="adminIntentReviewField">
          <span>{t("adminIntentReviewReviewerLabel")}</span>
          <input
            type="text"
            value={reviewerInput}
            onChange={(event) => setReviewerInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="adminBtn adminBtnPrimary"
          onClick={() => {
            saveAdminApiKey(apiKeyInput);
            saveAdminReviewerLabel(reviewerInput);
            window.location.reload();
          }}
          disabled={!apiKeyInput.trim()}
        >
          {t("adminIntentReviewUnlock")}
        </button>
      </main>
    );
  }

  return (
    <main className="adminIntentReviewPage">
      <header className="adminIntentReviewHeader">
        <h1>{t("adminIntentReviewTitle")}</h1>
        <a href="#/">{t("adminIntentReviewBackToDemo")}</a>
      </header>

      <section className="adminExportPanel">
        <div className="adminExportPanelMain">
          <div className="adminExportReadyBlock">
            <span className="adminExportReadyLabel">{t("adminExportReadyLabel")}</span>
            <strong className="adminExportReadyCount">{readyExportCount ?? 0}</strong>
          </div>
          <button
            type="button"
            className="adminBtn adminBtnPrimary"
            onClick={() => void handleCreateExportBatch()}
            disabled={exportLoading || (readyExportCount ?? 0) === 0}
          >
            {exportLoading ? t("adminExportCreating") : t("adminExportCreateBatch")}
          </button>
        </div>
        {exportError ? <div className="error">{exportError}</div> : null}
        {exportBatch ? (
          <div className="adminExportResult">
            <p>{t("adminExportBatchId", { id: exportBatch.id })}</p>
            <p>{t("adminExportRecordCount", { count: exportBatch.record_count })}</p>
            <p>{t("adminExportArtifactSha", { sha: exportBatch.artifact_sha256 ?? "-" })}</p>
            <p>{t("adminExportManifestSha", { sha: exportBatch.manifest_sha256 ?? "-" })}</p>
            <div className="adminIntentReviewActions">
              <button
                type="button"
                className="adminBtn adminBtnSecondary"
                onClick={() => void handleDownload("jsonl")}
              >
                {t("adminExportDownloadJsonl")}
              </button>
              <button
                type="button"
                className="adminBtn adminBtnSecondary"
                onClick={() => void handleDownload("manifest")}
              >
                {t("adminExportDownloadManifest")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {loading && items.length === 0 ? (
        <p className="adminEmptyState adminEmptyStateLoading">{t("adminIntentReviewLoading")}</p>
      ) : null}
      {loadError ? <div className="error">{loadError}</div> : null}
      {!loading && !loadError && items.length === 0 ? (
        <p className="adminEmptyState">{t("adminIntentReviewEmpty")}</p>
      ) : null}

      <ul className="adminIntentReviewList">
        {items.map((item) => {
          const state = reviewById[item.id];
          return (
            <li key={item.id} className="adminIntentReviewCard">
              <div className="adminIntentReviewCardHead">
                <p className="adminIntentReviewComment">
                  <strong>{item.source_author_display_name}</strong>: {item.source_comment_text}
                </p>
                <span className="adminStatusChip">{t("adminIntentReviewPending")}</span>
              </div>
              <dl className="adminIntentReviewMeta">
                <div className="adminIntentReviewMetaItem">
                  <dt>{t("adminIntentReviewPredicted")}</dt>
                  <dd>
                    <span className="adminIntentValue">
                      {formatIntentLabel(item.predicted_intent, t)}
                    </span>
                    <span className="adminConfidenceChip">
                      {Math.round(item.prediction_confidence * 100)}%
                    </span>
                  </dd>
                </div>
                <div className="adminIntentReviewMetaItem">
                  <dt>{t("adminIntentReviewProposed")}</dt>
                  <dd>
                    <span className="adminIntentValue adminIntentValueProposed">
                      {formatIntentLabel(item.proposed_intent, t)}
                    </span>
                  </dd>
                </div>
                <div className="adminIntentReviewMetaItem adminIntentReviewMetaItemWide">
                  <dt>{t("adminIntentReviewModel")}</dt>
                  <dd className="adminModelId">
                    {item.model_id} @ {item.model_version}
                  </dd>
                </div>
                {item.user_note ? (
                  <div className="adminIntentReviewMetaItem adminIntentReviewMetaItemWide">
                    <dt>{t("adminIntentReviewUserNote")}</dt>
                    <dd>{item.user_note}</dd>
                  </div>
                ) : null}
              </dl>

              <label className="adminIntentReviewField">
                <span>{t("adminIntentReviewFinalIntent")}</span>
                <select
                  value={state?.finalIntent ?? item.proposed_intent}
                  onChange={(event) =>
                    setReviewById((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] ?? {
                          finalIntent: item.proposed_intent,
                          reviewNote: "",
                          submitting: null,
                          error: null,
                          completed: false,
                        }),
                        finalIntent: event.target.value,
                      },
                    }))
                  }
                  disabled={Boolean(state?.submitting)}
                >
                  {intentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="adminIntentReviewField">
                <span>{t("adminIntentReviewReviewNote")}</span>
                <input
                  type="text"
                  value={state?.reviewNote ?? ""}
                  onChange={(event) =>
                    setReviewById((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] ?? {
                          finalIntent: item.proposed_intent,
                          reviewNote: "",
                          submitting: null,
                          error: null,
                          completed: false,
                        }),
                        reviewNote: event.target.value,
                      },
                    }))
                  }
                  disabled={Boolean(state?.submitting)}
                />
              </label>

              {state?.error ? <div className="error">{state.error}</div> : null}

              <div className="adminIntentReviewActions">
                <button
                  type="button"
                  className="adminBtn adminBtnApprove"
                  onClick={() => {
                    void handleApprove(item);
                  }}
                  disabled={Boolean(state?.submitting) || !state?.finalIntent}
                >
                  {state?.submitting === "approve"
                    ? t("adminIntentReviewApproving")
                    : t("adminIntentReviewApprove")}
                </button>
                <button
                  type="button"
                  className="adminBtn adminBtnReject"
                  onClick={() => {
                    void handleReject(item);
                  }}
                  disabled={Boolean(state?.submitting)}
                >
                  {state?.submitting === "reject"
                    ? t("adminIntentReviewRejecting")
                    : t("adminIntentReviewReject")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {nextCursor ? (
        <button
          type="button"
          className="adminBtn adminBtnSecondary adminLoadMoreBtn"
          onClick={() => {
            void loadPage(nextCursor, true);
          }}
          disabled={loading}
        >
          {t("adminIntentReviewLoadMore")}
        </button>
      ) : null}
    </main>
  );
}
