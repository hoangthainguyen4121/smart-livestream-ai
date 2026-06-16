# Known Limitations and Future Improvements

## Known Limitations

- Recognition quality depends on lighting, camera quality, face pose, and registration sample diversity.
- The PoC uses CPU execution by default, which may limit real-time performance.
- Gesture recognition is heuristic-based and may produce false positives.
- Gesture effects are global and not assigned to a specific recognized face.
- MediaPipe Hands may miss hands when they are partially occluded or outside the camera frame.
- Multi-face recognition is supported by the detection pipeline, but performance depends on hardware.
- Local embeddings are biometric data and should be protected even in academic experiments.

## Future Improvements

- Add recognition throttling and result caching for smoother FPS.
- Add better registration quality checks for blur, pose, and lighting.
- Add user-specific face image management.
- Add person-to-gesture association using pose landmarks or tracking.
- Add configurable GPU execution for InsightFace where available.
- Replace heuristic gestures with a trained gesture classifier if the product scope requires it.
- Add automated tests around storage, matching, and gesture state logic.
