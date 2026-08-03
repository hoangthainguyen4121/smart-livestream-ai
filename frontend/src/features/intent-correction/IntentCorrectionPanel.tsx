import { useMemo, useState } from "react";

import { submitIntentCorrection } from "../../api/intentCorrections";
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

  const intentOptions = useMemo(
    () =>
      ML_INTENT_LABELS.filter((intent) => intent !== context.predictedIntent).map((intent) => ({
        value: intent,
        label: formatIntentLabel(intent, t),
      })),
    [context.predictedIntent, t],
  );

  async function handleSubmit() {
    if (!proposedIntent || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = buildIntentCorrectionPayload(
        context,
        proposedIntent,
        getOrCreateViewerSessionKey(),
        userNote,
      );
      await submitIntentCorrection(payload);
      onSubmitted(context.sourceCommentId);
      setOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("intentCorrectionSubmitError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chatCorrectionButton"
        onClick={() => setOpen(true)}
      >
        {t("intentCorrectionReportWrong")}
      </button>
    );
  }

  return (
    <div className="chatCorrectionForm">
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
          disabled={submitting}
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
          disabled={submitting}
        />
      </label>
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <div className="chatCorrectionActions">
        <button type="button" onClick={() => setOpen(false)} disabled={submitting}>
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={submitting || !proposedIntent}
        >
          {submitting ? t("intentCorrectionSubmitting") : t("intentCorrectionSubmit")}
        </button>
      </div>
    </div>
  );
}
