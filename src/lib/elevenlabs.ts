// ElevenLabs API client — Scribe v2 (speech-to-text) + TTS (Flash v2.5)

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const GEORGE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/**
 * Transcribe audio using ElevenLabs Scribe v2.
 * Accepts raw audio buffer (webm, mp4, mp3, etc.)
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  apiKey: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.webm");
  formData.append("model_id", "scribe_v1");

  const response = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Scribe v2 transcription failed (${response.status}): ${errorText}`
    );
  }

  const result = (await response.json()) as { text: string };
  return result.text;
}

/**
 * Generate speech from text using ElevenLabs TTS Flash v2.5.
 * Returns raw MP3 audio buffer.
 */
export async function generateVerdictAudio(
  text: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const response = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${GEORGE_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `TTS generation failed (${response.status}): ${errorText}`
    );
  }

  return response.arrayBuffer();
}
