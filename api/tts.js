const OPENAI_TTS_MODEL = "tts-1";
const DEFAULT_VOICE = "nova";
const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable." }));
    return;
  }

  const { text, voice } = request.body || {};
  const safeText = String(text || "").trim().slice(0, 300);
  if (!safeText) {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "text is required." }));
    return;
  }

  const safeVoice = ALLOWED_VOICES.has(voice) ? voice : DEFAULT_VOICE;

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        input: safeText,
        voice: safeVoice,
        response_format: "mp3",
        speed: 1.05
      })
    });

    if (!openaiResponse.ok) {
      let message = "OpenAI TTS failed.";
      try {
        const err = await openaiResponse.json();
        message = err?.error?.message || message;
      } catch {
        // ignore parse error
      }
      console.error(`[tts] OpenAI TTS failed with ${openaiResponse.status}: ${message}`);
      response.statusCode = openaiResponse.status;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ error: message }));
      return;
    }

    const audioBuffer = await openaiResponse.arrayBuffer();
    response.statusCode = 200;
    response.setHeader("Content-Type", "audio/mpeg");
    response.setHeader("Cache-Control", "no-store");
    response.end(Buffer.from(audioBuffer));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected TTS error." }));
  }
};
