import { useState, useRef, useCallback, useEffect } from "react";

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

type AppState = "idle" | "listening" | "processing" | "done";

const DEMO_SCRIPT = `Hi, this is James Richardson from the executive office. I'm calling on behalf of Mr. Anderson, the CEO. He's currently in a board meeting and asked me to reach out to you directly because this is time-sensitive. We have a vendor payment that needs to go out today before 5 PM. The vendor has changed their banking details, and the CEO has already approved the transfer. The amount is forty-seven thousand dollars, and it needs to go to the new account details I'll provide you. I understand this is unusual, but Mr. Anderson specifically asked that we handle this quietly — the vendor situation is confidential and related to the acquisition we're working on. He doesn't want this going through normal channels because of the sensitivity. Can you confirm you have access to process wire transfers? I'll need you to set up the new payee right now. If we miss the 5 PM deadline, the deal could fall through, and frankly, Mr. Anderson will not be happy. What's your employee ID so I can note that you're handling this?`;

export function App() {
  const [state, setState] = useState<AppState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shieldState, setShieldState] = useState<"idle" | "listening" | "safe" | "danger">("idle");
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showSlack, setShowSlack] = useState(false);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  };

  // Simulate live transcript appearing word by word
  const simulateTranscript = useCallback(() => {
    const words = DEMO_SCRIPT.split(" ");
    const wordDelay = 120; // ms per word

    words.forEach((_, i) => {
      const id = setTimeout(() => {
        setLiveTranscript(words.slice(0, i + 1).join(" "));
      }, i * wordDelay);
      timersRef.current.push(id);
    });

    // After all words shown, trigger API call
    const totalDuration = words.length * wordDelay;
    const id = setTimeout(() => {
      analyzeText(DEMO_SCRIPT);
    }, totalDuration);
    timersRef.current.push(id);
  }, []);

  const startListening = useCallback(() => {
    setState("listening");
    setShieldState("listening");
    setError(null);
    setResult(null);
    setLiveTranscript("");
    setShowAnalysis(false);
    setShowAlert(false);
    setShowSlack(false);

    simulateTranscript();
  }, [simulateTranscript]);

  const analyzeText = async (transcript: string) => {
    setState("processing");

    try {
      const response = await fetch("/api/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error: string }).error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as AnalysisResult;
      setResult(data);
      setState("done");

      // Set shield color
      const isDangerous = data.analysis.threat_level === "dangerous";
      setShieldState(isDangerous ? "danger" : "safe");

      // Staged reveal of analysis sections
      const t1 = setTimeout(() => setShowAnalysis(true), 300);
      const t2 = setTimeout(() => setShowAlert(true), 800);
      const t3 = setTimeout(() => {
        if (data.slack_alert.sent) setShowSlack(true);
      }, 1300);
      timersRef.current.push(t1, t2, t3);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setState("idle");
      setShieldState("idle");
    }
  };

  const reset = () => {
    clearTimers();
    setState("idle");
    setShieldState("idle");
    setResult(null);
    setLiveTranscript("");
    setError(null);
    setShowAnalysis(false);
    setShowAlert(false);
    setShowSlack(false);
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const shieldClass =
    shieldState === "danger" ? "shield danger" :
    shieldState === "safe" ? "shield safe" :
    shieldState === "listening" ? "shield listening" :
    "shield";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <svg className="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h1>TrustVoice</h1>
        </div>
        <span className="header-sub">Real-Time Vishing Detection</span>
      </header>

      {/* Main content area — single screen layout */}
      <div className="main-grid">
        {/* Left: Shield + Controls */}
        <div className="shield-panel">
          <div className={shieldClass}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="shield-label">
            {state === "idle" && "Monitoring Active"}
            {state === "listening" && "Listening..."}
            {state === "processing" && "Analyzing..."}
            {state === "done" && result && (
              result.analysis.threat_level === "dangerous" ? "THREAT DETECTED" :
              result.analysis.threat_level === "suspicious" ? "Suspicious" : "Call Cleared"
            )}
          </div>

          {state === "idle" && (
            <button className="btn btn-primary btn-large" onClick={startListening}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Start Listening
            </button>
          )}

          {state === "listening" && (
            <div className="waveform">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          )}

          {state === "processing" && <div className="spinner" />}

          {state === "done" && result && (
            <>
              <div className={`risk-score-large ${result.analysis.threat_level}`}>
                {result.analysis.risk_score}
              </div>
              <button className="btn btn-small" onClick={reset}>Analyze Another Call</button>
            </>
          )}
        </div>

        {/* Right: Live feed */}
        <div className="feed-panel">
          {/* Error */}
          {error && <div className="feed-error">{error}</div>}

          {/* Transcript */}
          {(state === "listening" || state === "processing" || state === "done") && liveTranscript && (
            <div className="feed-card">
              <div className="feed-card-header">
                <span className="feed-title">Call Transcript</span>
                <span className="chip chip-elevenlabs">ElevenLabs Scribe</span>
              </div>
              <p className="transcript-text">
                {state === "done" && result ? (
                  <HighlightedTranscript text={result.transcript} indicators={result.analysis.indicators} />
                ) : (
                  <>{liveTranscript}<span className="cursor">|</span></>
                )}
              </p>
            </div>
          )}

          {/* Analysis */}
          {showAnalysis && result && (
            <div className="feed-card fade-in">
              <div className="feed-card-header">
                <span className="feed-title">Threat Analysis</span>
                <span className="chip chip-cloudflare">Cloudflare Workers AI</span>
              </div>
              <div className="pipeline-flow">
                <span className="pipe-step">ElevenLabs Scribe</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step active">Workers AI (Llama 3.3)</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step">Durable Object</span>
              </div>
              <div className="indicators">
                {result.analysis.indicators
                  .sort((a, b) => b.score - a.score)
                  .map((ind, i) => (
                    <div key={i} className={`indicator-pill ${ind.severity}`}>
                      <span>{ind.type.replace(/_/g, " ")}</span>
                      <span className="indicator-score">{ind.score}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Alert */}
          {showAlert && result && (
            <div className={`feed-card alert-card ${result.analysis.threat_level} fade-in`}>
              <div className={`alert-label ${result.analysis.threat_level}`}>
                {result.analysis.threat_level === "dangerous" ? "VISHING ATTACK DETECTED" :
                 result.analysis.threat_level === "suspicious" ? "SUSPICIOUS ACTIVITY" : "CALL CLEARED"}
              </div>
              <p className="alert-summary">{result.analysis.summary}</p>
              {result.analysis.recommended_action && (
                <p className="alert-action">{result.analysis.recommended_action}</p>
              )}
            </div>
          )}

          {/* Slack */}
          {showSlack && result && result.slack_alert.sent && (
            <div className="feed-card slack-card fade-in">
              <div className="feed-card-header">
                <span className="feed-title">Alert Dispatched</span>
                <span className="chip chip-slack">Slack Webhook</span>
              </div>
              <div className="slack-info">
                <svg className="slack-logo" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
                <span>Notification sent to <strong>{result.slack_alert.channel}</strong></span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {state === "idle" && !error && (
            <div className="feed-empty">
              <p>Press <strong>Start Listening</strong> to begin call monitoring</p>
              <p className="feed-empty-sub">The system will transcribe, analyze, and classify the call in real-time</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        <span>Built with</span>
        <span className="footer-brand">ElevenLabs</span>
        <span>and</span>
        <span className="footer-brand">Cloudflare</span>
      </footer>
    </div>
  );
}

function HighlightedTranscript({ text, indicators }: { text: string; indicators: ThreatIndicator[] }) {
  const evidenceMap = indicators
    .filter((ind) => ind.evidence && text.includes(ind.evidence))
    .map((ind) => ({ text: ind.evidence, severity: ind.severity, start: text.indexOf(ind.evidence) }))
    .sort((a, b) => a.start - b.start);

  if (evidenceMap.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const ev of evidenceMap) {
    if (ev.start < lastEnd) continue;
    if (ev.start > lastEnd) parts.push(text.slice(lastEnd, ev.start));
    parts.push(
      <span key={ev.start} className={`threat-phrase ${ev.severity === "medium" ? "threat-medium" : ""}`}>
        {ev.text}
      </span>
    );
    lastEnd = ev.start + ev.text.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));

  return <>{parts}</>;
}
