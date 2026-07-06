import { useEffect, useRef } from "react";

import { useI18n } from "../../i18n/I18nProvider";
import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../browser-ar/types";
import { drawObjectDetectorOverlay } from "./drawObjectDetectorOverlay";
import type { ObjectDetectorSnapshot } from "./objectDetectorTypes";

type ObjectDetectorOverlayProps = {
  enabled: boolean;
  snapshot: ObjectDetectorSnapshot;
};

export function ObjectDetectorOverlay({ enabled, snapshot }: ObjectDetectorOverlayProps) {
  const { locale, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const localeRef = useRef(locale);
  const hudTemplateRef = useRef(t("objectDetectorHud"));

  snapshotRef.current = snapshot;
  localeRef.current = locale;
  hudTemplateRef.current = t("objectDetectorHud");

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
      drawObjectDetectorOverlay(context, snapshotRef.current, canvas.width, canvas.height, {
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
