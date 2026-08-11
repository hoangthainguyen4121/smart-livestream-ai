import { useEffect, useRef } from "react";

type RemoteLiveVideoProps = {
  stream: MediaStream | null;
  className?: string;
};

export function RemoteLiveVideo({ stream, className }: RemoteLiveVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => {
        // Autoplay can fail until user gesture; muted helps.
      });
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className ?? "video browserArCanvas"}
      autoPlay
      playsInline
      muted
    />
  );
}
