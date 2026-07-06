export function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 12_000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Camera timeout — video source did not start. Close other apps using the webcam and retry.",
        ),
      );
    }, timeoutMs);

    const onReady = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("playing", onReady);
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("playing", onReady);
  });
}
