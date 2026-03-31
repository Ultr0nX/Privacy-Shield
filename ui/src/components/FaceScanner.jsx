import React, { useEffect, useRef } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const FaceScanner = ({ onLandmarksDetected, setStatus, frameCount = 0, targetFrames = 30 }) => {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const isInitializingRef = useRef(false);
  const animationFrameRef = useRef(null);
  const onLandmarksRef = useRef(onLandmarksDetected);
  const setStatusRef = useRef(setStatus);

  useEffect(() => {
    onLandmarksRef.current = onLandmarksDetected;
    setStatusRef.current = setStatus;
  }, [onLandmarksDetected, setStatus]);

  useEffect(() => {
    let isMounted = true;
    const videoElement = videoRef.current;

    const processFrame = () => {
      if (!isMounted || !videoElement || !landmarkerRef.current) return;
      if (videoElement.readyState >= 2) {
        const result = landmarkerRef.current.detectForVideo(videoElement, performance.now());
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          onLandmarksRef.current({
            landmarks: result.faceLandmarks[0],
            blendshapes: result.faceBlendshapes?.[0]?.categories || [],
            timestamp: performance.now(),
            videoElement,
          });
        } else {
          setStatusRef.current("No face detected. Align yourself with the camera.");
        }
      }
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    const initFaceScanner = async () => {
      if (isInitializingRef.current) return;
      isInitializingRef.current = true;
      try {
        if (!videoElement) {
          setStatusRef.current("Video element initialization failed");
          isInitializingRef.current = false;
          return;
        }
        setStatusRef.current("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user", frameRate: { ideal: 30 } },
        });
        if (!isMounted) { stream.getTracks().forEach(t => t.stop()); isInitializingRef.current = false; return; }
        streamRef.current = stream;
        videoElement.srcObject = stream;
        await new Promise(resolve => { videoElement.onloadedmetadata = resolve; });
        await videoElement.play();
        setStatusRef.current("Initializing liveness scanner...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        setStatusRef.current("Camera started. Complete liveness challenge.");
        animationFrameRef.current = requestAnimationFrame(processFrame);
        isInitializingRef.current = false;
      } catch (error) {
        isInitializingRef.current = false;
        console.error("Face scanner init error:", error);
        if (error.name === "NotAllowedError") setStatusRef.current("Camera permission denied.");
        else if (error.name === "NotFoundError") setStatusRef.current("No camera found.");
        else if (error.name === "NotReadableError") setStatusRef.current("Camera in use by another app.");
        else setStatusRef.current("Failed to initialize scanner: " + error.message);
      }
    };

    const timer = setTimeout(initFaceScanner, 300);
    return () => {
      isMounted = false;
      isInitializingRef.current = false;
      clearTimeout(timer);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoElement) videoElement.srcObject = null;
      if (landmarkerRef.current) { try { landmarkerRef.current.close(); } catch {} landmarkerRef.current = null; }
    };
  }, []);

  const progress = targetFrames > 0 ? Math.min((frameCount / targetFrames) * 100, 100) : 0;

  return (
    <div style={s.wrapper}>
      {/* Animated scan ring */}
      <div style={s.ringOuter}>
        <div style={s.ringInner} />
      </div>

      {/* Video */}
      <div style={s.container}>
        <video ref={videoRef} style={s.video} autoPlay playsInline muted />
        {/* Grid overlay */}
        <div style={s.gridOverlay} />
        {/* Corner brackets */}
        <div style={{...s.corner, top: 8, left: 8, borderTop: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)'}} />
        <div style={{...s.corner, top: 8, right: 8, borderTop: '2px solid var(--accent)', borderRight: '2px solid var(--accent)'}} />
        <div style={{...s.corner, bottom: 8, left: 8, borderBottom: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)'}} />
        <div style={{...s.corner, bottom: 8, right: 8, borderBottom: '2px solid var(--accent)', borderRight: '2px solid var(--accent)'}} />
      </div>

      {/* Frame progress bar */}
      {frameCount > 0 && (
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${progress}%` }} />
        </div>
      )}

      {/* Status line */}
      <div style={s.statusLine}>
        {frameCount > 0
          ? `Scanning... frame ${frameCount}/${targetFrames}`
          : 'Align face within the frame'}
      </div>
    </div>
  );
};

const s = {
  wrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  ringOuter: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% + 24px)',
    aspectRatio: '4/3',
    borderRadius: 16,
    border: '1.5px solid rgba(20,196,162,0.25)',
    animation: 'scanPulse 2.5s ease-in-out infinite',
    pointerEvents: 'none',
    zIndex: 2,
  },
  ringInner: {
    position: 'absolute',
    inset: -6,
    borderRadius: 20,
    border: '1px solid rgba(20,196,162,0.12)',
  },
  container: {
    position: 'relative',
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    border: '0.5px solid var(--border-base)',
    zIndex: 1,
  },
  video: {
    width: '100%',
    height: 'auto',
    display: 'block',
    transform: 'scaleX(-1)',
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(20,196,162,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(20,196,162,0.04) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  corner: {
    position: 'absolute',
    width: 16,
    height: 16,
    opacity: 0.8,
  },
  progressWrap: {
    width: '100%',
    height: 3,
    background: 'var(--border-base)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBar: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  statusLine: {
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    textAlign: 'center',
  },
};

export default FaceScanner;
