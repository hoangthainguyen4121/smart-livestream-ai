import { formatIntentLabel } from "../sales-nlp/formatChatIntentLabel";
import type { TranslationKey } from "../../i18n/translations";
import type { ModelExplanationTopLabel } from "./salesAssistantTypes";

type ModelExplanationTopLabelsProps = {
  topLabels: ModelExplanationTopLabel[];
  t: (key: TranslationKey) => string;
};

export function ModelExplanationTopLabels({ topLabels, t }: ModelExplanationTopLabelsProps) {
  if (topLabels.length === 0) {
    return null;
  }

  return (
    <ul className="modelExplainTopLabels">
      {topLabels.slice(0, 3).map((item) => (
        <li className="modelExplainTopLabelRow" key={`${item.label}-${item.confidence}`}>
          <span className="modelExplainTopLabelName">{formatIntentLabel(item.label, t)}</span>
          <span className="modelExplainTopLabelPct">{(item.confidence * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  );
}
