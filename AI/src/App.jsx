import { useEffect, useRef } from 'react';
import { useBiometricPipeline } from './hooks/useBiometricPipeline';

export default function App() {
  const { state, videoRef, actions, hasEnrollment } = useBiometricPipeline();
  const consoleEndRef = useRef(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  const stepState = (stepId, phase) => {
    const donePhases = {
      liveness: ['embedding', 'fuzzy', 'done'],
      embedding: ['fuzzy', 'done'],
      fuzzy: ['done'],
      result: [],
    };
    if (phase === 'done' && stepId === 'result') return 'done';
    if (donePhases[stepId]?.includes(phase)) return 'done';
    if (phase === stepId) return 'active';
    if (phase === 'error') return '';
    return '';
  };

  const connectorState = (beforeStep, phase) => {
    const st = stepState(beforeStep, phase);
    if (st === 'done') return 'done';
    if (st === 'active') return 'active';
    return '';
  };

  const phase = state.phase;
  const isRunning = ['liveness', 'embedding', 'fuzzy'].includes(phase);

  const steps = [
    { id: 'liveness', icon: '👁️', label: 'Liveness' },
    { id: 'embedding', icon: '🧠', label: 'Embedding' },
    { id: 'fuzzy', icon: '🔐', label: 'Fuzzy Extract' },
    { id: 'result', icon: '✅', label: 'Secret_ID' },
  ];

  return (
    <div className={`app-container phase-${phase}`}>
      {/* Header */}
      <header className="header">
        <div className="header__badge">
          <span className="pulse-dot" />
          Privacy Shield Protocol
        </div>
        <h1>🛡️ ZK-Biometric Identity</h1>
        <p>
          Prove you're human without revealing who you are.
          Liveness → Embedding → Fuzzy Extract → Zero-Knowledge Proof.
        </p>
      </header>

      {/* Pipeline Steps */}
      <div className="pipeline">
        {steps.map((step, i) => (
          <span key={step.id} style={{ display: 'contents' }}>
            {i > 0 && (
              <div className={`pipeline__connector ${connectorState(steps[i - 1].id, phase)}`} />
            )}
            <div className={`pipeline__step ${stepState(step.id, phase)}`}>
              <span className="step-icon">{step.icon}</span>
              {step.label}
            </div>
          </span>
        ))}
      </div>

      {/* Main Grid */}
      <div className="main-grid">
        {/* Camera Card */}
        <div className={`card camera-card ${state.scanning ? 'scanning' : ''}`}>
          <div className="card__header">
            <h3>
              <span className="card__section-icon blue">📹</span>
              Camera Feed
            </h3>
            <span className={`cam-badge ${state.cameraReady ? 'live' : 'offline'}`}>
              {state.cameraReady ? '● LIVE' : 'Offline'}
            </span>
          </div>
          <div className="video-wrapper">
            <video ref={videoRef} autoPlay playsInline style={{ display: state.cameraReady ? 'block' : 'none' }} />
            {!state.cameraReady && (
              <div className="video-placeholder">
                <div className="cam-icon">📷</div>
                <p>Click "Start Camera" to begin</p>
              </div>
            )}
            {/* Corner brackets */}
            <div className="corner-bracket tl" />
            <div className="corner-bracket tr" />
            <div className="corner-bracket bl" />
            <div className="corner-bracket br" />
            {/* Scanner */}
            <div className={`scanner-overlay ${state.scanning ? 'active' : ''}`}>
              <div className="scanner-line" />
            </div>
          </div>
        </div>

        {/* Info Panels */}
        <div className="info-column">
          {/* Liveness Card */}
          <div className="card">
            <div className="card__body">
              <div className="section-title">
                <span className="section-emoji">👁️</span>
                Liveness Detection
              </div>
              <div className="liveness-list">
                {[
                  { id: 'blink', label: 'Blink Detection (EAR)', val: state.liveness.blink },
                  { id: 'motion', label: 'Head Micro-Motion', val: state.liveness.motion },
                  { id: 'smile', label: 'Expression Challenge', val: state.liveness.smile },
                ].map(check => (
                  <div className="liveness-item" key={check.id}>
                    <span className={`liveness-icon ${check.val === true ? 'pass' : check.val === false ? 'fail' : ''}`}>
                      {check.val === true ? '✓' : check.val === false ? '✗' : '—'}
                    </span>
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Biometric Data Card */}
          <div className="card">
            <div className="card__body">
              <div className="section-title">
                <span className="section-emoji">🧠</span>
                Biometric Data
              </div>
              <div className="data-field">
                <span className="data-field__label">Embedding Dimensions</span>
                <div className={`data-field__value purple ${!state.embedding.dim ? 'waiting' : ''}`}>
                  {state.embedding.dim ? `${state.embedding.dim} dimensions (L2-normalized)` : '— waiting —'}
                </div>
              </div>
            </div>
          </div>

          {/* Crypto Output Card */}
          <div className="card">
            <div className="card__body">
              <div className="section-title">
                <span className="section-emoji">🔐</span>
                Cryptographic Output
              </div>
              <div className="data-field">
                <span className="data-field__label">Secret_ID (Poseidon Hash)</span>
                <div className={`data-field__value green ${!state.crypto.secretID ? 'waiting' : ''}`}>
                  {state.crypto.secretID ? `${state.crypto.secretID.substring(0, 50)}...` : '— waiting —'}
                </div>
              </div>
              <div className="data-field">
                <span className="data-field__label">BCH Errors Corrected</span>
                <div className={`data-field__value amber ${state.crypto.bchErrors === null ? 'waiting' : ''}`}>
                  {state.crypto.bchErrors !== null ? `${state.crypto.bchErrors} corrected by BCH` : '— waiting —'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-bar">
        {!state.cameraReady ? (
          <button className="btn btn-primary" onClick={actions.startCamera}>
            📷 Start Camera
          </button>
        ) : (
          <>
            <button className="btn btn-primary" onClick={actions.enroll} disabled={isRunning}>
              {isRunning && phase !== 'done' && <span className="spinner" />}
              🛡️ Enroll Identity
            </button>
            <button
              className="btn btn-outline"
              onClick={actions.verify}
              disabled={isRunning || !hasEnrollment}
              title={!hasEnrollment ? 'Enroll first' : ''}
            >
              🔄 Re-Verify
            </button>
          </>
        )}
      </div>

      {!state.cameraReady && (
        <div className="info-hint">
          🔒 Camera access is required for biometric scanning. All data stays in your browser — nothing is ever uploaded.
        </div>
      )}

      {/* Result Banner */}
      {state.result && (
        <div className={`result-banner ${state.result.success ? 'success' : 'failure'}`}>
          {state.result.success ? '✅' : '❌'} {state.result.message}
        </div>
      )}

      {/* Console Log */}
      <div className="console-panel card" style={{ marginTop: '1.5rem' }}>
        <div className="card__header">
          <h3>
            <span className="card__section-icon cyan">⌨️</span>
            Pipeline Log
          </h3>
        </div>
        <div className="card__body">
          {state.logs.map((log, i) => (
            <div className={`log-entry ${log.level}`} key={i}>
              <span className="ts">[{log.ts.toLocaleTimeString('en-GB')}]</span>{' '}
              {log.msg}
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}
