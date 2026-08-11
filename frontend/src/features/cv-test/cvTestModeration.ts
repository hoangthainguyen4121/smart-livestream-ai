/** Simulated moderation log for the CV test harness (never ends a real session). */

export type SimulatedModerationEvent = {
  atMs: number;
  code: "WOULD_TERMINATE";
  detail: string;
  label: "knife" | "scissors";
  confidence: number;
  evidenceCount: number;
};

export function buildWouldTerminateEvent(payload: {
  label: "knife" | "scissors";
  confidence: number;
  evidenceCount: number;
  windowMs: number;
}): SimulatedModerationEvent {
  return {
    atMs: Date.now(),
    code: "WOULD_TERMINATE",
    detail: `sharp_object_detected label=${payload.label} hits=${payload.evidenceCount} windowMs=${payload.windowMs}`,
    label: payload.label,
    confidence: payload.confidence,
    evidenceCount: payload.evidenceCount,
  };
}

export function formatSimulatedEvent(event: SimulatedModerationEvent): string {
  return `${event.code}: ${event.detail} conf=${event.confidence.toFixed(2)}`;
}
