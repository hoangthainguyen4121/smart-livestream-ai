import type { ModelExplanationFeature } from "./salesAssistantTypes";

type ModelExplanationBarsProps = {
  features: ModelExplanationFeature[];
  positive?: boolean;
};

export function ModelExplanationBars({ features, positive = true }: ModelExplanationBarsProps) {
  if (features.length === 0) {
    return null;
  }

  const maxWeight = Math.max(...features.map((feature) => Math.abs(feature.weight)), 0.001);

  return (
    <ul className="modelExplainBars">
      {features.map((feature) => {
        const width = Math.min(100, Math.round((Math.abs(feature.weight) / maxWeight) * 100));
        return (
          <li className="modelExplainBarRow" key={`${feature.token}-${feature.weight}`}>
            <span className="modelExplainBarToken">{feature.token}</span>
            <span className="modelExplainBarWeight">
              {feature.weight >= 0 ? "+" : ""}
              {feature.weight.toFixed(3)}
            </span>
            <span className="modelExplainBarTrack">
              <span
                className={
                  positive
                    ? "modelExplainBarFill modelExplainBarFillPositive"
                    : "modelExplainBarFill modelExplainBarFillNegative"
                }
                style={{ width: `${width}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
