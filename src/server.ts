import { Hono } from "hono";
import { cors } from "hono/cors";
import { transcribeAudio, generateVerdictAudio } from "./lib/elevenlabs";
import { classifyThreats, type ThreatAnalysis } from "./lib/threat-classifier";
import { sendSlackAlert } from "./lib/slack";

export { CallSession } from "./call-session";

type Bindings = {
  AI: Ai;
  CALL_SESSION: DurableObjectNamespace;
  ELEVENLABS_API_KEY: string;
  SLACK_WEBHOOK_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", cors());

// Main analysis endpoint — full pipeline
app.post("/api/analyze", async (c) => {
  const startTime = Date.now();

  const formData = await c.req.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return c.json({ error: "No audio file provided" }, 400);
  }

  const audioBuffer = await audioFile.arrayBuffer();

  // Step 1: Transcribe with ElevenLabs Scribe v2
  let transcript: string;
  try {
    transcript = await transcribeAudio(audioBuffer, c.env.ELEVENLABS_API_KEY);
  } catch (err) {
    console.error("Transcription error:", err);
    return c.json({ error: "Transcription failed" }, 500);
  }

  if (!transcript || transcript.trim().length === 0) {
    return c.json({ error: "No speech detected in audio" }, 400);
  }

  // Step 2: Classify threats with Workers AI
  let analysis: ThreatAnalysis;
  try {
    analysis = await classifyThreats(transcript, c.env.AI);
  } catch (err) {
    console.error("Classification error:", err);
    return c.json({ error: "Threat classification failed" }, 500);
  }

  // Step 3: Send Slack alert if risk > 60 (non-blocking via waitUntil)
  let slackResult = { sent: false, channel: "#security-alerts" };
  if (analysis.risk_score > 60 && c.env.SLACK_WEBHOOK_URL) {
    c.executionCtx.waitUntil(
      sendSlackAlert(transcript, analysis, c.env.SLACK_WEBHOOK_URL).catch(
        (err) => console.error("Slack alert failed:", err)
      )
    );
    // Optimistic: response returns sent=true before webhook completes
    slackResult = { sent: true, channel: "#security-alerts" };
  }

  // Step 4: Store in Durable Object
  try {
    const id = c.env.CALL_SESSION.newUniqueId();
    const stub = c.env.CALL_SESSION.get(id);
    c.executionCtx.waitUntil(
      stub.fetch("https://internal/store", {
        method: "POST",
        body: JSON.stringify({ transcript, analysis, slackResult }),
      })
    );
  } catch (err) {
    console.error("DO storage failed (non-critical):", err);
  }

  const processingTimeMs = Date.now() - startTime;

  return c.json({
    transcript,
    analysis,
    slack_alert: slackResult,
    processing_time_ms: processingTimeMs,
  });
});

// Demo mode — accepts text directly, skips ElevenLabs transcription
app.post("/api/analyze-text", async (c) => {
  const startTime = Date.now();

  const body = (await c.req.json()) as { transcript?: string };
  const transcript = body.transcript?.trim();

  if (!transcript) {
    return c.json({ error: "No transcript provided" }, 400);
  }

  // Classify threats with Workers AI
  let analysis: ThreatAnalysis;
  try {
    analysis = await classifyThreats(transcript, c.env.AI);
  } catch (err) {
    console.error("Classification error:", err);
    return c.json({ error: "Threat classification failed" }, 500);
  }

  // Send Slack alert if risk > 60
  let slackResult = { sent: false, channel: "#security-alerts" };
  if (analysis.risk_score > 60 && c.env.SLACK_WEBHOOK_URL) {
    c.executionCtx.waitUntil(
      sendSlackAlert(transcript, analysis, c.env.SLACK_WEBHOOK_URL).catch(
        (err) => console.error("Slack alert failed:", err)
      )
    );
    slackResult = { sent: true, channel: "#security-alerts" };
  }

  // Store in Durable Object
  try {
    const id = c.env.CALL_SESSION.newUniqueId();
    const stub = c.env.CALL_SESSION.get(id);
    c.executionCtx.waitUntil(
      stub.fetch("https://internal/store", {
        method: "POST",
        body: JSON.stringify({ transcript, analysis, slackResult }),
      })
    );
  } catch (err) {
    console.error("DO storage failed (non-critical):", err);
  }

  const processingTimeMs = Date.now() - startTime;

  return c.json({
    transcript,
    analysis,
    slack_alert: slackResult,
    processing_time_ms: processingTimeMs,
  });
});

// Separate TTS endpoint — frontend passes verdict text
app.get("/api/verdict-audio", async (c) => {
  const text = c.req.query("text");
  if (!text) {
    return c.json({ error: "Missing text parameter" }, 400);
  }
  if (text.length > 500) {
    return c.json({ error: "Text too long (max 500 chars)" }, 400);
  }

  try {
    const audioBuffer = await generateVerdictAudio(
      text,
      c.env.ELEVENLABS_API_KEY
    );
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return c.json({ error: "TTS generation failed" }, 500);
  }
});

export default app;
