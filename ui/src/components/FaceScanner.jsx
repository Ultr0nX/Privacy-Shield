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

  useEffect(() => {
    let isMounted = true;

    const initFaceMesh = async () => {
      try {
        // 1. Initialize FaceMesh Instance
        faceMeshRef.current = new FaceMesh({
          locateFile: (file) => 
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        // 2. Configure Options
        faceMeshRef.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        // 3. Set Results Callback
        faceMeshRef.current.onResults((results) => {
          if (!isMounted) return;
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            onLandmarksDetected(results.multiFaceLandmarks[0]);
          } else {
            setStatus("No face detected. Align yourself with the camera.");
          }
        });

        // 4. Initialize Camera
        if (videoRef.current) {
          cameraRef.current = new Camera(videoRef.current, {
            onFrame: async () => {
              if (isMounted && faceMeshRef.current) {
                await faceMeshRef.current.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480,
          });
          
          await cameraRef.current.start();
          setStatus("Camera started. Please stay still.");
        }
      } catch (error) {
        console.error("FaceMesh Init Error:", error);
        setStatus("Failed to initialize scanner. Check camera permissions.");
      }
    };

    initFaceMesh();

    // CLEANUP: Kill camera and WASM instance on unmount
    return () => {
      isMounted = false;
      
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      
      console.log("Scanner resources cleaned up.");
    };
  }, [onLandmarksDetected, setStatus]);

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
  },
};

export default FaceScanner;