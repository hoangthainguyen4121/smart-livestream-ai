import { useEffect, useRef } from "react";

import { useI18n } from "../../i18n/I18nProvider";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../browser-ar/types";
import { drawObjectDetectorOverlay } from "./drawObjectDetectorOverlay";
import { mapDetectionBoxToOverlay } from "./productDetectionPolicy";
import type { ObjectDetectorSnapshot } from "./objectDetectorTypes";

type ObjectDetectorOverlayProps = {
  enabled: boolean;
  snapshot: ObjectDetectorSnapshot;
  getSourceCanvas?: () => HTMLCanvasElement | null;
};

export function ObjectDetectorOverlay({
  enabled,
  snapshot,
  getSourceCanvas,
}: ObjectDetectorOverlayProps) {
  const { locale, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const localeRef = useRef(locale);
  const hudTemplateRef = useRef(t("objectDetectorHud"));
  const getSourceCanvasRef = useRef(getSourceCanvas);

  snapshotRef.current = snapshot;
  localeRef.current = locale;
  hudTemplateRef.current = t("objectDetectorHud");
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
      const sourceWidth = source?.width || snapshotRef.current.sourceWidth || canvas.width;
      const sourceHeight = source?.height || snapshotRef.current.sourceHeight || canvas.height;

      if (sourceWidth > 0 && canvas.width !== sourceWidth) {
        canvas.width = sourceWidth;
      }
      if (sourceHeight > 0 && canvas.height !== sourceHeight) {
        canvas.height = sourceHeight;
      }

      const mappedSnapshot: ObjectDetectorSnapshot = {
        ...snapshotRef.current,
        detections: snapshotRef.current.detections.map((hit) =>
          mapDetectionBoxToOverlay(
            hit,
            snapshotRef.current.sourceWidth || sourceWidth,
            snapshotRef.current.sourceHeight || sourceHeight,
            canvas.width,
            canvas.height,
          ),
        ),
      };

      drawObjectDetectorOverlay(context, mappedSnapshot, canvas.width, canvas.height, {
        locale: localeRef.current,
        hudTemplate: hudTemplateRef.current,
      });
      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [enabled, locale, t]);

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
