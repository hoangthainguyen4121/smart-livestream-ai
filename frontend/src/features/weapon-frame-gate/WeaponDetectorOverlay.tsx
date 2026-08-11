import { useEffect, useRef } from "react";

import type { WeaponDetectionDto } from "../../api/weaponDetector";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../browser-ar/types";

type WeaponDetectorOverlayProps = {
  enabled: boolean;
  detections: WeaponDetectionDto[];
  getSourceCanvas?: () => HTMLCanvasElement | null;
};

/** Lightweight host-only boxes for Grounding DINO weapon hits (warning overlay). */
export function WeaponDetectorOverlay({
  enabled,
  detections,
  getSourceCanvas,
}: WeaponDetectorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectionsRef = useRef(detections);
  const getSourceCanvasRef = useRef(getSourceCanvas);
  detectionsRef.current = detections;
  getSourceCanvasRef.current = getSourceCanvas;

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
      const source = getSourceCanvasRef.current?.() ?? null;
      const width = source?.width || canvas.width || CAPTURE_WIDTH;
      const height = source?.height || canvas.height || CAPTURE_HEIGHT;
      if (width > 0 && canvas.width !== width) {
        canvas.width = width;
      }
      if (height > 0 && canvas.height !== height) {
        canvas.height = height;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const hit of detectionsRef.current) {
        if (!hit.box || hit.box.length < 4) {
          continue;
        }
        const [x1, y1, x2, y2] = hit.box;
        const w = Math.max(1, x2 - x1);
        const h = Math.max(1, y2 - y1);
        context.strokeStyle = "rgba(220, 60, 40, 0.95)";
        context.lineWidth = 2;
        context.strokeRect(x1, y1, w, h);
        context.fillStyle = "rgba(220, 60, 40, 0.85)";
        context.font = "12px sans-serif";
        const label = `${hit.label} ${(hit.score * 100).toFixed(0)}%`;
        context.fillText(label, x1 + 4, Math.max(14, y1 - 4));
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
      className="objectDetectorCanvas"
      aria-hidden="true"
    />
  );
}
