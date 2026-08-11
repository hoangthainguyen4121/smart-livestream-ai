/** Replace video track on existing senders without recreating the peer connection. */
export async function replaceVideoSenderTrack(
  peerConnection: RTCPeerConnection,
  track: MediaStreamTrack | null,
): Promise<boolean> {
  const videoSender =
    peerConnection.getSenders().find((entry) => entry.track?.kind === "video") ??
    peerConnection
      .getTransceivers()
      .find((transceiver) => transceiver.receiver.track?.kind === "video" || transceiver.mid != null)
      ?.sender;

  if (!videoSender) {
    return false;
  }

  if (videoSender.track === track) {
    return false;
  }

  await videoSender.replaceTrack(track);
  return true;
}
