import { useEffect, useRef, useState } from "react";

import {
  cancelFaceRegistrationSession,
  completeFaceRegistrationSession,
  createFaceRegistrationSession,
  getFaceRegistrationApiBaseUrl,
  isRegistrationSessionMissingError,
  submitFaceRegistrationSample,
  type FaceRegistrationCompleteResponse,
  type FaceRegistrationSampleResponse,
  type FaceRegistrationSession,
  type PoseName,
} from "../api/faceRegistration";


const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;
const CAPTURE_JPEG_QUALITY = 0.85;
const REQUIRED_POSES: PoseName[] = ["front", "left", "right"];
const noopRegistrationActiveChange = () => undefined;


type FaceRegistrationPanelProps = {
  defaultDisplayName: string;
  onRegistrationActiveChange?: (isActive: boolean) => void;
};


export function FaceRegistrationPanel({
  defaultDisplayName,
  onRegistrationActiveChange = noopRegistrationActiveChange,
}: FaceRegistrationPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [selectedPose, setSelectedPose] = useState<PoseName>("front");
  const [session, setSession] = useState<FaceRegistrationSession | null>(null);
  const [lastSampleResult, setLastSampleResult] =
    useState<FaceRegistrationSampleResponse | null>(null);
  const [completeResult, setCompleteResult] =
    useState<FaceRegistrationCompleteResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    return () => {
      stopCamera();
      onRegistrationActiveChange(false);
    };
  }, [onRegistrationActiveChange]);

  async function handleStartRegistration() {
    const name = displayName.trim();
    if (!name) {
      setErrorMessage("Display name is required.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setCompleteResult(null);
    setLastSampleResult(null);
    setIsCameraReady(false);
    onRegistrationActiveChange(true);

    try {
      const createdSession = await createFaceRegistrationSession(name);
      if (!createdSession.session_id?.trim()) {
        throw new Error(
          `Registration session was not created. Backend: ${getFaceRegistrationApiBaseUrl()}`,
        );
      }
      setSession(createdSession);
      setStatusMessage(
        `Session ${createdSession.session_id.slice(0, 8)}… ready. Capture front, then left or right samples.`,
      );
      await startCamera();
    } catch (error) {
      onRegistrationActiveChange(false);
      setSession(null);
      setErrorMessage(formatRegistrationError(error, "start registration"));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCaptureSample() {
    if (!session) {
      return;
    }

    const frame = captureFrame();
    if (!frame) {
      setErrorMessage("Camera frame is not ready yet.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      setStatusMessage(`Analyzing ${selectedPose} sample… first capture may take up to 3 minutes on Railway.`);
      const response = await submitFaceRegistrationSample(
        session.session_id,
        selectedPose,
        frame,
      );
      setLastSampleResult(response);
      setSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              accepted_count: response.accepted_count,
              pose_counts: response.pose_counts,
              can_complete: response.can_complete,
            }
          : currentSession,
      );
      setStatusMessage(response.reason);
      if (response.accepted) {
        setSelectedPose(getNextPose(response.pose_counts));
      }
    } catch (error) {
      if (isRegistrationSessionMissingError(error)) {
        setSession(null);
        stopCamera();
        onRegistrationActiveChange(false);
        setErrorMessage(
          "Registration session expired or backend restarted. Click Start Registration again.",
        );
      } else {
        setErrorMessage(formatRegistrationError(error, "submit sample"));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCompleteRegistration() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await completeFaceRegistrationSession(session.session_id);
      setCompleteResult(response);
      setStatusMessage(
        `Registered ${response.display_name} with ${response.samples} accepted samples.`,
      );
      setSession(null);
      setLastSampleResult(null);
      setIsCameraReady(false);
      stopCamera();
      onRegistrationActiveChange(false);
    } catch (error) {
      if (isRegistrationSessionMissingError(error)) {
        setSession(null);
        stopCamera();
        onRegistrationActiveChange(false);
        setErrorMessage(
          "Registration session expired or backend restarted. Click Start Registration again.",
        );
      } else {
        setErrorMessage(formatRegistrationError(error, "complete registration"));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCancelRegistration() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      await cancelFaceRegistrationSession(session.session_id);
      setSession(null);
      setLastSampleResult(null);
      setStatusMessage("Registration cancelled.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to cancel registration.");
    } finally {
      stopCamera();
      onRegistrationActiveChange(false);
      setIsBusy(false);
    }
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: CAPTURE_HEIGHT },
      },
      audio: false,
    });
    mediaStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }

  function stopCamera() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", CAPTURE_JPEG_QUALITY);
  }

  return (
    <section className="faceRegistrationPanel">
      <div className="cardHeader">
        <div>
          <h2>Web Face Registration</h2>
          <p className="panelDescription">
            Capture diverse face samples. Raw images are not stored by default.
          </p>
        </div>
        <span className="status">{session ? "active" : "idle"}</span>
      </div>

      <div className="faceRegistrationControls">
        <label className="registrationField">
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={session !== null || isBusy}
            maxLength={32}
            placeholder="Display name"
          />
        </label>
        {!session ? (
          <button type="button" onClick={handleStartRegistration} disabled={isBusy}>
            Start Registration
          </button>
        ) : (
          <button type="button" onClick={handleCancelRegistration} disabled={isBusy}>
            Cancel
          </button>
        )}
      </div>

      {session ? (
        <div className="registrationWorkspace">
          <div className="registrationVideoFrame">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setIsCameraReady(true)}
            />
          </div>
          <div className="registrationSteps">
            <p>
              Accepted {session.accepted_count}/{session.minimum_samples}. Need at least
              one front sample and one left or right sample.
            </p>
            <div className="poseButtons">
              {REQUIRED_POSES.map((pose) => (
                <button
                  className={selectedPose === pose ? "active" : ""}
                  type="button"
                  onClick={() => setSelectedPose(pose)}
                  key={pose}
                >
                  {pose} ({session.pose_counts[pose] ?? 0})
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCaptureSample}
              disabled={isBusy || !isCameraReady}
            >
              Capture {selectedPose}
            </button>
            <button
              type="button"
              onClick={handleCompleteRegistration}
              disabled={isBusy || !session.can_complete}
            >
              Complete Registration
            </button>
          </div>
        </div>
      ) : null}

      {lastSampleResult ? (
        <div className={lastSampleResult.accepted ? "successNotice" : "error"}>
          {lastSampleResult.reason}
        </div>
      ) : null}
      {completeResult ? (
        <div className="successNotice">
          Registration complete. Switch to Backend Annotated Stream to verify recognition.
        </div>
      ) : null}
      {statusMessage ? <p className="panelDescription">{statusMessage}</p> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <canvas ref={canvasRef} className="hiddenCanvas" />
    </section>
  );
}


function getNextPose(poseCounts: Record<PoseName, number>): PoseName {
  if ((poseCounts.front ?? 0) === 0) {
    return "front";
  }
  if ((poseCounts.left ?? 0) === 0) {
    return "left";
  }
  if ((poseCounts.right ?? 0) === 0) {
    return "right";
  }

  return "front";
}

function formatRegistrationError(error: unknown, action: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return `Unable to ${action}.`;
}
