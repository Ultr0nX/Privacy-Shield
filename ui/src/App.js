import React, { useEffect, useRef } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

function App() {
  const videoRef = useRef(null);

  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        console.log("Landmarks count:", landmarks.length);
        console.log("Sample landmark:", landmarks[0]);
      }
    });

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          await faceMesh.send({ image: videoRef.current });
        },
        width: 640,
        height: 480,
      });

      camera.start();
    }
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>MediaPipe FaceMesh Test</h2>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "640px", height: "480px" }}
      />
    </div>
  );
}

export default App;
