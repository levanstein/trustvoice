import { useState, useRef, useCallback, useEffect } from "react";

// Types matching the API response
interface ThreatIndicator {
  type: string;
  evidence: string;
  severity: "high" | "medium" | "low";
  score: number;
}

interface ThreatAnalysis {
  risk_score: number;
  threat_level: "safe" | "suspicious" | "dangerous";
  threat_type: string;
  indicators: ThreatIndicator[];
  summary: string;
  recommended_action: string;
  confidence: number;
}

interface AnalysisResult {
  transcript: string;
  analysis: ThreatAnalysis;
  slack_alert: { sent: boolean; channel: string };
  processing_time_ms: number;
}

type AppState = "idle" | "listening" | "processing" | "revealing" | "done";

// Pipeline steps shown in the staged reveal
type RevealStep =
  | "transcript"
  | "analysis"
  | "alert"
  | "slack"
  | "verdict";

export function App() {
  const [state, setState] = useState<AppState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<RevealStep[]>([]);
  const [typedText, setTypedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verdictAudioUrl, setVerdictAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start microphone recording
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer audio/mp4, fallback to audio/webm
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        analyzeAudio(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState("listening");
      setError(null);
    } catch (err) {
      setError(
        "Microphone access denied. Please allow microphone access or upload a file."
      );
    }
  }, []);

  // Stop recording
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("processing");
    }
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setState("processing");
      setError(null);
      analyzeAudio(file);
    },
    []
  );

  // Send audio to the API
  const analyzeAudio = async (audio: Blob | File) => {
    setState("processing");
    setError(null);
    setResult(null);
    setVisibleSteps([]);
    setTypedText("");
    setVerdictAudioUrl(null);

    try {
      const formData = new FormData();
      formData.append("audio", audio);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error: string }).error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as AnalysisResult;
      setResult(data);
      setState("revealing");
      startStagedReveal(data);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setState("idle");
    }
  };

  // Staged reveal — choreographed step-by-step animation
  const startStagedReveal = (data: AnalysisResult) => {
    const steps: { step: RevealStep; delay: number }[] = [];
    let cumulative = 0;

    // Step 1: Transcript (immediate)
    steps.push({ step: "transcript", delay: 0 });
    // Type-out effect takes ~30ms/char
    const typeoutDuration = Math.min(data.transcript.length * 30, 3000);
    cumulative += typeoutDuration + 400;

    // Step 2: Threat analysis (after transcript types out)
    steps.push({ step: "analysis", delay: cumulative });
    cumulative += 800;

    // Step 3: Alert (always show — different styling for each threat level)
    steps.push({ step: "alert", delay: cumulative });
    cumulative += 800;

    // Step 4: Slack notification (if sent)
    if (data.slack_alert.sent) {
      steps.push({ step: "slack", delay: cumulative });
      cumulative += 800;
    }

    // Step 5: Verdict
    steps.push({ step: "verdict", delay: cumulative });

    // Schedule each step (store timer IDs for cleanup on reset)
    timersRef.current = [];
    for (const { step, delay } of steps) {
      const id = setTimeout(() => {
        setVisibleSteps((prev) => [...prev, step]);
        if (step === "transcript") {
          typeOutText(data.transcript);
        }
        if (step === "verdict") {
          setState("done");
          // Fetch TTS audio in the background
          fetchVerdictAudio(data);
        }
      }, delay);
      timersRef.current.push(id);
    }
  };

  // Typewriter effect for transcript
  const typeOutText = (text: string) => {
    const charDelay = 30;
    const maxChars = text.length;
    let i = 0;

    const tick = () => {
      if (i < maxChars) {
        // Show multiple characters per frame for long texts
        const chunkSize = maxChars > 200 ? 3 : 1;
        i = Math.min(i + chunkSize, maxChars);
        setTypedText(text.slice(0, i));
        setTimeout(tick, charDelay);
      }
    };
    tick();
  };

  // Fetch TTS verdict audio
  const fetchVerdictAudio = async (data: AnalysisResult) => {
    const verdictText =
      data.analysis.threat_level === "dangerous"
        ? `Warning. Vishing attack detected. Risk score ${data.analysis.risk_score} out of 100. ${data.analysis.summary} ${data.analysis.recommended_action}`
        : `Call analysis complete. Risk score ${data.analysis.risk_score} out of 100. No significant threats detected. This call appears safe.`;

    try {
      const resp = await fetch(
        `/api/verdict-audio?text=${encodeURIComponent(verdictText)}`
      );
      if (resp.ok) {
        const blob = await resp.blob();
        setVerdictAudioUrl(URL.createObjectURL(blob));
      }
    } catch {
      // TTS is non-critical — fail silently
    }
  };

  // Play verdict audio
  const playVerdict = () => {
    if (!verdictAudioUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(verdictAudioUrl);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };

  // Reset to idle
  const reset = () => {
    // Clear all pending reveal/typewriter timers
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
    setState("idle");
    setResult(null);
    setVisibleSteps([]);
    setTypedText("");
    setError(null);
    setVerdictAudioUrl(null);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (verdictAudioUrl) URL.revokeObjectURL(verdictAudioUrl);
    };
  }, [verdictAudioUrl]);

  const isDangerous =
    result && result.analysis.threat_level === "dangerous";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <svg
          className="header-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <h1>TrustVoice</h1>
        <span>Real-Time Vishing Detection</span>
      </header>

      {/* Error */}
      {error && (
        <div
          className="step-card"
          style={{
            borderColor: "var(--danger-border)",
            background: "var(--danger-bg)",
            marginBottom: 16,
          }}
        >
          <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>
        </div>
      )}

      {/* Idle state */}
      {state === "idle" && (
        <div className="idle-container">
          <svg
            className="shield-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2>Monitoring Active</h2>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={startListening}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Start Listening
            </button>
            <span className="or-divider">or</span>
            <button
              className="btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Audio
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="file-input"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      )}

      {/* Listening state */}
      {state === "listening" && (
        <div className="idle-container">
          <svg
            className="shield-icon listening"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2>Listening...</h2>
          <div className="waveform">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="waveform-bar"
                style={{ animationDelay: `${i * 0.05}s` }}
              />
            ))}
          </div>
          <button className="btn btn-danger" onClick={stopListening}>
            Stop Recording
          </button>
        </div>
      )}

      {/* Processing state */}
      {state === "processing" && (
        <div className="processing">
          <div className="spinner" />
          <p>Analyzing call... running ElevenLabs Scribe + Workers AI pipeline</p>
        </div>
      )}

      {/* Staged reveal timeline */}
      {(state === "revealing" || state === "done") && result && (
        <div className="timeline">
          {/* Step 1: Transcript */}
          {visibleSteps.includes("transcript") && (
            <div className="step-card">
              <div className="step-header">
                <span className="step-title">Speech-to-Text Transcription</span>
                <span className="chip chip-elevenlabs">ElevenLabs Scribe v2</span>
              </div>
              <TranscriptText
                text={typedText}
                indicators={result.analysis.indicators}
                fullText={result.transcript}
              />
            </div>
          )}

          {/* Step 2: Threat Analysis */}
          {visibleSteps.includes("analysis") && (
            <div className="step-card">
              <div className="step-header">
                <span className="step-title">Threat Pattern Analysis</span>
                <span className="chip chip-cloudflare">
                  Cloudflare Workers AI
                </span>
              </div>
              <div className="service-flow">
                <span className="chip chip-elevenlabs">Scribe v2</span>
                <span className="flow-arrow">→</span>
                <span className="chip chip-cloudflare">Workers AI</span>
                <span className="flow-arrow">→</span>
                <span className="chip chip-cloudflare">Durable Object</span>
              </div>
              <div className="indicators">
                {result.analysis.indicators
                  .sort((a, b) => b.score - a.score)
                  .map((ind, i) => (
                    <div
                      key={i}
                      className={`indicator-pill ${ind.severity}`}
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <span>{ind.type.replace(/_/g, " ")}</span>
                      <span className="indicator-score">{ind.score}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Step 3: Alert card — all threat levels */}
          {visibleSteps.includes("alert") && (
            <div
              className={`step-card alert-card ${result.analysis.threat_level}`}
            >
              <div className={`alert-label ${result.analysis.threat_level}`}>
                {result.analysis.threat_level === "dangerous"
                  ? "Vishing Attack Detected"
                  : result.analysis.threat_level === "suspicious"
                    ? "Suspicious Activity"
                    : "Call Cleared"}
              </div>
              <div className={`risk-score ${result.analysis.threat_level}`}>
                {result.analysis.risk_score}
              </div>
              <p className="alert-summary">{result.analysis.summary}</p>
              {result.analysis.recommended_action && (
                <p
                  className="alert-summary"
                  style={{ marginTop: 4, fontWeight: 500 }}
                >
                  {result.analysis.recommended_action}
                </p>
              )}
            </div>
          )}

          {/* Step 4: Slack */}
          {visibleSteps.includes("slack") && (
            <div className="step-card">
              <div className="step-header">
                <span className="step-title">Security Alert Dispatched</span>
                <span className="chip chip-slack">Slack Webhook</span>
              </div>
              <div className="slack-preview">
                <span>Notification sent to</span>
                <span className="slack-badge">
                  {result.slack_alert.channel}
                </span>
              </div>
            </div>
          )}

          {/* Step 5: Verdict */}
          {visibleSteps.includes("verdict") && (
            <div className="step-card">
              <div className="step-header">
                <span className="step-title">Voice Verdict Generated</span>
                <span className="chip chip-elevenlabs">
                  ElevenLabs TTS · Flash v2.5
                </span>
              </div>
              <div className="verdict-player">
                <button
                  className="play-btn"
                  onClick={playVerdict}
                  disabled={!verdictAudioUrl}
                  title={
                    verdictAudioUrl ? "Play verdict" : "Loading audio..."
                  }
                >
                  {isPlaying ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </button>
                <span className="verdict-text">
                  {isDangerous
                    ? `"Warning. Vishing attack detected. Risk score ${result.analysis.risk_score} out of 100."`
                    : `"Call analysis complete. No significant threats detected."`}
                </span>
              </div>
            </div>
          )}

          {/* Processing time + reset */}
          {state === "done" && (
            <div className="reset-container">
              <button className="btn" onClick={reset}>
                Analyze Another Call
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginLeft: 12,
                  alignSelf: "center",
                }}
              >
                Processed in {(result.processing_time_ms / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Transcript with highlighted threat phrases
function TranscriptText({
  text,
  indicators,
  fullText,
}: {
  text: string;
  indicators: ThreatIndicator[];
  fullText: string;
}) {
  // Only highlight once the full text has typed out
  if (text.length < fullText.length) {
    return <p className="transcript-text">{text}<span style={{ opacity: 0.4 }}>|</span></p>;
  }

  // Build highlighted transcript
  const evidenceMap = indicators
    .filter((ind) => ind.evidence && fullText.includes(ind.evidence))
    .map((ind) => ({
      text: ind.evidence,
      severity: ind.severity,
      start: fullText.indexOf(ind.evidence),
    }))
    .sort((a, b) => a.start - b.start);

  if (evidenceMap.length === 0) {
    return <p className="transcript-text">{text}</p>;
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const ev of evidenceMap) {
    if (ev.start < lastEnd) continue; // Skip overlapping
    if (ev.start > lastEnd) {
      parts.push(fullText.slice(lastEnd, ev.start));
    }
    parts.push(
      <span
        key={ev.start}
        className={`threat-phrase ${ev.severity === "medium" ? "threat-phrase-medium" : ""}`}
      >
        {ev.text}
      </span>
    );
    lastEnd = ev.start + ev.text.length;
  }
  if (lastEnd < fullText.length) {
    parts.push(fullText.slice(lastEnd));
  }

  return <p className="transcript-text">{parts}</p>;
}
