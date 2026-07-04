import type { DecisionTimelineStep } from "./salesExplainDisplay";

type SalesDecisionTimelineProps = {
  steps: DecisionTimelineStep[];
};

export function SalesDecisionTimeline({ steps }: SalesDecisionTimelineProps) {
  return (
    <ol className="salesDecisionTimeline">
      {steps.map((step, index) => (
        <li className="salesDecisionTimelineItem" key={step.key}>
          <div className="salesDecisionTimelineChip">{step.label}</div>
          <p className="salesDecisionTimelineDetail">{step.detail}</p>
          {index < steps.length - 1 ? <span className="salesDecisionTimelineArrow">↓</span> : null}
        </li>
      ))}
    </ol>
  );
}
