import { useEffect, useRef } from "react";

import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../browser-ar/types";
import { drawHandVisionDebugOverlay } from "./drawHandVisionDebugOverlay";
import type { HandVisionDebugSnapshot } from "./handVisionDebugTypes";

type HandVisionDebugOverlayProps = {
  enabled: boolean;
  snapshot: HandVisionDebugSnapshot | null;
};

export function HandVisionDebugOverlay({ enabled, snapshot }: HandVisionDebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    let animationFrame = 0;
    const draw = () => {
      const currentSnapshot = snapshotRef.current;
      if (currentSnapshot) {
        drawHandVisionDebugOverlay(context, currentSnapshot, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      width={CAPTURE_WIDTH}
      height={CAPTURE_HEIGHT}
      className="handVisionDebugCanvas"
      aria-hidden="true"
    />
  );
}
