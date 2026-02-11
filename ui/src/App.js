import React, { useEffect, useRef, useState } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { buildPoseidon } from "circomlibjs";

/* -------------------- Math Utilities -------------------- */

function distance(p1, p2) {
  return Math.sqrt(
    (p1.x - p2.x) ** 2 +
    (p1.y - p2.y) ** 2 +
    (p1.z - p2.z) ** 2
  );
}

function generateRatios(landmarks) {
  const eyeL = landmarks[33];
  const eyeR = landmarks[263];
  const nose = landmarks[1];
  const mouthL = landmarks[61];
  const mouthR = landmarks[291];
  const chin = landmarks[152];

  const eyeDist = distance(eyeL, eyeR);

  return [
    distance(nose, eyeL) / eyeDist,
    distance(nose, eyeR) / eyeDist,
    distance(mouthL, mouthR) / eyeDist,
    distance(nose, chin) / eyeDist,
  ];
}

function quantizeRatios(ratios) {
  return ratios.map((r) => Math.floor(r * 100000));
}

/* -------------------- React Component -------------------- */

function App() {
  const videoRef = useRef(null);
  const ratioBuffer = useRef([]);
  const poseidonRef = useRef(null);

  const [secretID, setSecretID] = useState(null);
  const [status, setStatus] = useState("Initializing…");

  useEffect(() => {
    async function init() {
      // Initialize Poseidon
      poseidonRef.current = await buildPoseidon();

      const faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      faceMesh.onResults((results) => {
        if (!results.multiFaceLandmarks) return;

        const landmarks = results.multiFaceLandmarks[0];
        const ratios = generateRatios(landmarks);
        ratioBuffer.current.push(ratios);

        setStatus("Scanning face… keep steady");

        if (ratioBuffer.current.length === 15) {
          const avgRatios = ratios.map((_, i) =>
            ratioBuffer.current.reduce((sum, r) => sum + r[i], 0) /
            ratioBuffer.current.length
          );

          const quantized = quantizeRatios(avgRatios);

          // Poseidon hash
          const poseidon = poseidonRef.current;
          const hash = poseidon(quantized);
          const secret = poseidon.F.toString(hash);

          setSecretID(secret);
          setStatus("Face scan completed ✔");

          ratioBuffer.current = [];
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
    }

    init();
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h2>Face Scan · Poseidon ID</h2>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "640px", height: "480px", borderRadius: "8px" }}
      />

      <p><strong>Status:</strong> {status}</p>

      {secretID && (
        <div style={{ marginTop: "20px" }}>
          <h3>Generated Secret_ID</h3>
          <code
            style={{
              display: "block",
              wordBreak: "break-all",
              background: "#f4f4f4",
              padding: "10px",
              borderRadius: "6px",
            }}
          >
            {secretID}
          </code>
        </div>
      )}
    </div>
  );
}

export default App;
