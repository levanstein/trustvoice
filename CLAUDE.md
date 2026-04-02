# TrustVoice

## Project Overview
TrustVoice — real-time vishing (voice phishing) detection platform. Built for ElevenHacks #2 hackathon (ElevenLabs x Cloudflare).

## Tech Stack
- **Backend**: Cloudflare Workers + Hono, Workers AI (Llama 3.3 70B), Durable Objects
- **Frontend**: React 19 + Vite, vanilla CSS (Vercel-style minimal design)
- **APIs**: ElevenLabs Scribe v2 (STT), ElevenLabs TTS Flash v2.5, Slack Webhooks
- **Language**: TypeScript

## Development
```bash
npm install        # Install dependencies
npm run dev        # Start dev server (Vite + Wrangler)
npm run build      # Production build
npm run deploy     # Build + deploy to Cloudflare Workers
npx tsc --noEmit   # Type-check
```

## Secrets (set via `wrangler secret put`)
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `SLACK_WEBHOOK_URL` — Slack incoming webhook URL

## Architecture
- `src/server.ts` — Hono Worker: API routes (`/api/analyze`, `/api/verdict-audio`)
- `src/call-session.ts` — Durable Object: stores analysis results
- `src/lib/elevenlabs.ts` — ElevenLabs Scribe v2 + TTS client
- `src/lib/threat-classifier.ts` — Workers AI threat classification (6 categories)
- `src/lib/slack.ts` — Slack Block Kit alert sender
- `src/app.tsx` — React dashboard with staged reveal animation
- `src/styles.css` — Vercel-style minimal white theme

## Conductor Access
This repo is configured for Claude Code Conductor (remote agent) access.
