import { useEffect, useMemo, useState } from "react";

import {
  IntentCorrectionApiError,
  submitIntentCorrection,
} from "../../api/intentCorrections";
import { formatIntentLabel } from "../sales-nlp/formatChatIntentLabel";
import { useI18n } from "../../i18n/I18nProvider";
import { buildIntentCorrectionPayload } from "./buildCommentCorrectionContext";
import type { CommentCorrectionContext } from "./intentCorrectionTypes";
import { ML_INTENT_LABELS } from "./mlIntentLabels";
import { getOrCreateViewerSessionKey } from "./viewerSessionKey";

type IntentCorrectionPanelProps = {
  context: CommentCorrectionContext;
  onSubmitted: (commentId: string) => void;
};

export function IntentCorrectionPanel({ context, onSubmitted }: IntentCorrectionPanelProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [proposedIntent, setProposedIntent] = useState("");
  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const intentOptions = useMemo(
    () =>
      ML_INTENT_LABELS.filter((intent) => intent !== context.predictedIntent).map((intent) => ({
        value: intent,
        label: formatIntentLabel(intent, t),
      })),
    [context.predictedIntent, t],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  function closeModal() {
    if (submitting) {
      return;
    }
    setOpen(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSubmit() {
    if (!proposedIntent || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload = buildIntentCorrectionPayload(
        context,
        proposedIntent,
        getOrCreateViewerSessionKey(),
        userNote,
      );
      await submitIntentCorrection(payload);
      setSuccessMessage(t("intentCorrectionSubmitted"));
      window.setTimeout(() => {
        onSubmitted(context.sourceCommentId);
        setOpen(false);
        setSuccessMessage(null);
        setProposedIntent("");
        setUserNote("");
      }, 450);
    } catch (error) {
      setErrorMessage(formatCorrectionError(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="chatCorrectionButton"
        onClick={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
          setOpen(true);
        }}
      >
        {t("intentCorrectionReportWrong")}
      </button>

      {open ? (
        <div
          className="chatCorrectionModalBackdrop"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="chatCorrectionModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-correction-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chatCorrectionModalHeader">
              <h3 id="chat-correction-modal-title">{t("intentCorrectionModalTitle")}</h3>
              <button
                type="button"
                className="chatCorrectionModalClose"
                onClick={closeModal}
                disabled={submitting}
              >
                {t("cancel")}
              </button>
            </div>

            <p className="chatCorrectionSummary">
              {t("intentCorrectionCurrentIntent", {
                intent: formatIntentLabel(context.predictedIntent, t),
                confidence: Math.round(context.predictionConfidence * 100),
              })}
            </p>

            <label className="chatCorrectionField">
              <span>{t("intentCorrectionProposedIntent")}</span>
              <select
                value={proposedIntent}
                onChange={(event) => setProposedIntent(event.target.value)}
                disabled={submitting || Boolean(successMessage)}
              >
                <option value="">{t("intentCorrectionChooseIntent")}</option>
                {intentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="chatCorrectionField">
              <span>{t("intentCorrectionNoteOptional")}</span>
              <input
                type="text"
                value={userNote}
                maxLength={600}
                onChange={(event) => setUserNote(event.target.value)}
                disabled={submitting || Boolean(successMessage)}
              />
            </label>

            {errorMessage ? <div className="chatCorrectionError">{errorMessage}</div> : null}
            {successMessage ? (
              <div className="chatCorrectionSuccess">{successMessage}</div>
            ) : null}

            <div className="chatCorrectionActions">
              <button
                type="button"
                className="chatCorrectionActionButton chatCorrectionActionButtonSecondary"
                onClick={closeModal}
                disabled={submitting}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="chatCorrectionActionButton chatCorrectionActionButtonPrimary"
                onClick={() => {
                  void handleSubmit();
                }}
                disabled={submitting || !proposedIntent || Boolean(successMessage)}
              >
                {submitting ? t("intentCorrectionSubmitting") : t("intentCorrectionSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatCorrectionError(
  error: unknown,
  t: (key: import("../../i18n/translations").TranslationKey) => string,
): string {
  if (error instanceof IntentCorrectionApiError) {
    if (error.code === "feedback_database_disabled") {
      return t("intentCorrectionDbDisabled");
    }
    return error.message || t("intentCorrectionSubmitError");
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return t("intentCorrectionSubmitError");
}
