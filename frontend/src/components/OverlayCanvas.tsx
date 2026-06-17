import { type RefObject, useEffect, useRef } from "react";


export type FaceOverlay = {
  username: string;
  confidence: number;
  bbox: [number, number, number, number];
};

type OverlayCanvasProps = {
  faces: FaceOverlay[];
  sourceWidth: number;
  sourceHeight: number;
  videoRef: RefObject<HTMLVideoElement>;
};

export function OverlayCanvas({
  faces,
  sourceWidth,
  sourceHeight,
  videoRef,
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    function drawOverlay() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        return;
      }

      const displayWidth = video.clientWidth;
      const displayHeight = video.clientHeight;
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.round(displayWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(displayHeight * pixelRatio));
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, displayWidth, displayHeight);

      const scaleX = displayWidth / sourceWidth;
      const scaleY = displayHeight / sourceHeight;

      faces.forEach((face) => {
        const [x1, y1, x2, y2] = face.bbox;
        const left = x1 * scaleX;
        const top = y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;
        const label = `${face.username} (${face.confidence.toFixed(2)})`;

        context.strokeStyle = "#22c55e";
        context.lineWidth = 3;
        context.strokeRect(left, top, width, height);

        context.font = "600 16px Inter, system-ui, sans-serif";
        const textWidth = context.measureText(label).width;
        const labelHeight = 24;
        const labelTop = Math.max(0, top - labelHeight);

        context.fillStyle = "rgba(34, 197, 94, 0.92)";
        context.fillRect(left, labelTop, textWidth + 12, labelHeight);
        context.fillStyle = "#ffffff";
        context.fillText(label, left + 6, labelTop + 17);
      });
    }

    drawOverlay();
    window.addEventListener("resize", drawOverlay);

    return () => {
      window.removeEventListener("resize", drawOverlay);
    };
  }, [faces, sourceHeight, sourceWidth, videoRef]);

  return <canvas ref={canvasRef} className="overlayCanvas" aria-hidden="true" />;
}
