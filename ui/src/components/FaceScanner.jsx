import React, { useEffect, useRef } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

/**
 * FaceScanner Component
 * Handles the MediaPipe lifecycle: Initialization, Tracking, and Cleanup.
 */
const FaceScanner = ({ onLandmarksDetected, setStatus }) => {
  const videoRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const streamRef = useRef(null);
  const isInitializingRef = useRef(false);
  
  // Use refs for callbacks to prevent effect re-runs
  const onLandmarksRef = useRef(onLandmarksDetected);
  const setStatusRef = useRef(setStatus);
  
  // Update refs when props change
  useEffect(() => {
    onLandmarksRef.current = onLandmarksDetected;
    setStatusRef.current = setStatus;
  }, [onLandmarksDetected, setStatus]);

  useEffect(() => {
    let isMounted = true;

    const initFaceMesh = async () => {
      // Prevent multiple simultaneous initializations
      if (isInitializingRef.current) {
        console.log("Already initializing, skipping...");
        return;
      }
      
      isInitializingRef.current = true;
      
      try {
        const videoElement = videoRef.current;
        
        if (!videoElement) {
          console.error("Video element not found");
          setStatusRef.current("Video element initialization failed");
          isInitializingRef.current = false;
          return;
        }

        setStatusRef.current("Requesting camera access...");

        // 1. Request camera access first with high quality settings
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
            frameRate: { ideal: 30 }
          } 
        });
        
        if (!isMounted) {
          // Component unmounted during await, stop stream
          stream.getTracks().forEach(track => track.stop());
          isInitializingRef.current = false;
          return;
        }
        
        streamRef.current = stream;
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          videoElement.onloadedmetadata = resolve;
        });
        
        await videoElement.play();
        
        setStatusRef.current("Initializing face detection...");

        // 2. Initialize FaceMesh Instance
        faceMeshRef.current = new FaceMesh({
          locateFile: (file) => 
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        // 3. Configure Options
        faceMeshRef.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // 4. Set Results Callback
        faceMeshRef.current.onResults((results) => {
          if (!isMounted) return;
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            onLandmarksRef.current(results.multiFaceLandmarks[0]);
          } else {
            setStatusRef.current("No face detected. Align yourself with the camera.");
          }
        });

        // 5. Initialize Camera for frame processing
        cameraRef.current = new Camera(videoElement, {
          onFrame: async () => {
            if (isMounted && faceMeshRef.current && videoElement) {
              await faceMeshRef.current.send({ image: videoElement });
            }
          },
          width: 640,
          height: 480,
        });
        
        await cameraRef.current.start();
        setStatusRef.current("Camera started. Please stay still.");
        isInitializingRef.current = false;

      } catch (error) {
        isInitializingRef.current = false;
        console.error("FaceMesh Init Error:", error);
        
        if (error.name === 'NotAllowedError') {
          setStatusRef.current("❌ Camera permission denied. Please allow camera access.");
        } else if (error.name === 'NotFoundError') {
          setStatusRef.current("❌ No camera found on this device.");
        } else if (error.name === 'NotReadableError') {
          setStatusRef.current("❌ Camera is in use by another application. Please close other apps using camera.");
        } else {
          setStatusRef.current("❌ Failed to initialize scanner: " + error.message);
        }
      }
    };

    // Longer delay to handle React strict mode double mounting
    const timer = setTimeout(initFaceMesh, 300);

    // CLEANUP: Kill camera and WASM instance on unmount
    return () => {
      isMounted = false;
      isInitializingRef.current = false;
      clearTimeout(timer);
      
      // Stop video stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      if (cameraRef.current) {
        try {
          cameraRef.current.stop();
        } catch (e) {
          console.log("Camera already stopped");
        }
        cameraRef.current = null;
      }
      
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (e) {
          console.log("FaceMesh already closed");
        }
        faceMeshRef.current = null;
      }
      
      console.log("Scanner resources cleaned up.");
    };
  }, []); // Empty deps - callbacks handled via refs

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        style={styles.video}
        autoPlay
        playsInline
        muted
      />
      {/* Optional: You can add an SVG overlay or landmark canvas here */}
    </div>
  );
};

const styles = {
  container: {
    position: "relative",
    width: "100%",
    maxWidth: "640px",
    margin: "0 auto",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: "#000",
    border: "2px solid #334155",
  },
  video: {
    width: "100%",
    height: "auto",
    display: "block",
    transform: "scaleX(-1)", // Mirror effect for user friendliness
    imageRendering: "-webkit-optimize-contrast", // Sharp rendering
    WebkitFontSmoothing: "antialiased",
    backfaceVisibility: "hidden",
  },
};

export default FaceScanner;