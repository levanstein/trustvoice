# Changelog

All notable changes to TrustVoice will be documented in this file.

## [0.1.0.0] - 2026-04-01

### Added
- Real-time vishing detection pipeline: mic recording or file upload, ElevenLabs Scribe v1 transcription, Cloudflare Workers AI threat classification (6 categories), Slack webhook alerts, ElevenLabs TTS verdict
- Staged reveal animation with step-by-step card timeline showing transcript, threat indicators, risk score, Slack notification, and voice verdict
- Vercel-style minimal white/light UI with Inter + JetBrains Mono typography and service attribution chips (ElevenLabs blue, Cloudflare orange, Slack green)
- Three-state alert display: dangerous (red), suspicious (amber), safe (green)
- MediaRecorder mic input with audio/mp4 preferred format and webm fallback
- CallSession Durable Object for per-call results storage
- LLM output validation with field coercion and score clamping
- Cloudflare Workers deployment via `npm run deploy`
