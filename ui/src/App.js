import { useState } from "react";
import axios from "axios";

function App() {
  const [status, setStatus] = useState("Idle");

  const sendMockProof = async () => {
    setStatus("Sending mock proof...");

    const mockData = {
      proof: "this-is-a-dummy-proof",
      nullifier: "123456",
    };

    try {
      const response = await axios.post(
        "http://localhost:3001/relay",
        mockData
      );
      console.log("Backend response:", response.data);
      setStatus("Mock proof successfully sent ✔");
    } catch (error) {
      console.error(error);
      setStatus("Backend not reachable ❌");
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <h2 style={styles.logo}>Privacy Shield</h2>
      </header>

      {/* Main Card */}
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Identity Proof Demo</h1>

          <p style={styles.subtitle}>
            Phase 1 — Frontend to Backend Integration
          </p>

          <p style={styles.description}>
            This interface demonstrates the secure transmission of a
            <b> mock identity proof</b> from the user interface to the AI relayer
            backend. This phase validates system connectivity before integrating
            AI and cryptographic components.
          </p>

          <button style={styles.button} onClick={sendMockProof}>
            Generate Mock Proof
          </button>

          <div style={styles.statusBox}>
            <span style={styles.statusLabel}>Status</span>
            <span style={styles.statusText}>{status}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={styles.footer}>
        © 2026 Privacy Shield • Academic Prototype
      </footer>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(135deg, #eef2ff, #f8fafc)",
    fontFamily: "Segoe UI, sans-serif",
  },
  header: {
    padding: "16px 40px",
    backgroundColor: "#111827",
    color: "#ffffff",
  },
  logo: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "600",
  },
  container: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },
  card: {
    backgroundColor: "#ffffff",
    width: "460px",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
  },
  title: {
    marginBottom: "8px",
    color: "#1f2937",
  },
  subtitle: {
    marginBottom: "20px",
    color: "#2563eb",
    fontWeight: "500",
  },
  description: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: "#4b5563",
    marginBottom: "30px",
  },
  button: {
    width: "100%",
    padding: "14px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "background-color 0.3s",
  },
  statusBox: {
    marginTop: "25px",
    padding: "12px",
    backgroundColor: "#f1f5f9",
    borderRadius: "6px",
    display: "flex",
    justifyContent: "space-between",
    fontSize: "14px",
  },
  statusLabel: {
    fontWeight: "600",
    color: "#374151",
  },
  statusText: {
    color: "#111827",
  },
  footer: {
    textAlign: "center",
    padding: "12px",
    fontSize: "13px",
    color: "#6b7280",
  },
};

export default App;
