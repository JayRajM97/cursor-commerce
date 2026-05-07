const GEMINI_TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.0-flash";
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_AUDIO_BASE64_LENGTH = 6 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function isValidAudioPart(part) {
  return (
    part &&
    typeof part.data === "string" &&
    part.data.length > 0 &&
    part.data.length <= MAX_AUDIO_BASE64_LENGTH &&
    typeof part.mimeType === "string" &&
    /^audio\/(webm|mp4|mpeg|mp3|wav|ogg|x-m4a)/i.test(part.mimeType)
  );
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const { audio } = request.body || {};
  if (!isValidAudioPart(audio)) {
    sendJson(response, 400, { error: "Record a short audio clip and try again." });
    return;
  }

  if (process.env.OPENAI_API_KEY) {
    await transcribeWithOpenAI(audio, response);
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    sendJson(response, 500, { error: "Missing OPENAI_API_KEY or GEMINI_API_KEY environment variable." });
    return;
  }

  await transcribeWithGemini(audio, response);
};

async function transcribeWithOpenAI(audio, response) {
  try {
    const extension = getAudioExtension(audio.mimeType);
    const bytes = Buffer.from(audio.data, "base64");
    const form = new FormData();
    form.append("model", OPENAI_TRANSCRIBE_MODEL);
    form.append("response_format", "json");
    form.append("prompt", "Shopping concierge command. Examples: show giftable crystals under ten dollars; it is for my dark wood desk.");
    form.append("file", new Blob([bytes], { type: audio.mimeType }), `voice-command.${extension}`);

    const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const result = await openaiResponse.json();
    if (!openaiResponse.ok) {
      const message = result?.error?.message || "OpenAI transcription failed.";
      console.error(`[transcribe] OpenAI ${OPENAI_TRANSCRIBE_MODEL} failed with ${openaiResponse.status}: ${message}`);
      sendJson(response, openaiResponse.status, {
        error: /quota|rate limit|billing|insufficient_quota/i.test(message)
          ? "OpenAI transcription quota or billing is not available for this key."
          : message,
        model: OPENAI_TRANSCRIBE_MODEL,
        provider: "openai"
      });
      return;
    }

    const transcript = String(result.text || "").trim();
    if (!transcript) {
      sendJson(response, 502, { error: "Could not transcribe the audio. Try speaking a little longer." });
      return;
    }

    sendJson(response, 200, { transcript, model: OPENAI_TRANSCRIBE_MODEL, provider: "openai" });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected OpenAI transcription error."
    });
  }
}

async function transcribeWithGemini(audio, response) {
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSCRIBE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Transcribe this shopper voice command exactly. Return only the transcript text, no quotes, no markdown."
                },
                {
                  inline_data: {
                    mime_type: audio.mimeType,
                    data: audio.data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 120
          }
        })
      }
    );

    const result = await geminiResponse.json();
    if (!geminiResponse.ok) {
      const message = result?.error?.message || "Gemini transcription failed.";
      console.error(
        `[transcribe] Gemini ${GEMINI_TRANSCRIBE_MODEL} failed with ${geminiResponse.status}: ${message}`
      );
      sendJson(response, geminiResponse.status, {
        error: /quota|rate limit|billing|free_tier/i.test(message)
          ? "Voice transcription quota is exhausted for the configured Gemini key."
          : message,
        model: GEMINI_TRANSCRIBE_MODEL
      });
      return;
    }

    const transcript = (result?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join(" ")
      .replace(/^["']|["']$/g, "")
      .trim();

    if (!transcript) {
      sendJson(response, 502, { error: "Could not transcribe the audio. Try speaking a little longer." });
      return;
    }

    sendJson(response, 200, { transcript, model: GEMINI_TRANSCRIBE_MODEL });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected transcription error."
    });
  }
}

function getAudioExtension(mimeType) {
  if (/mp4|x-m4a/.test(mimeType)) return "m4a";
  if (/mpeg|mp3/.test(mimeType)) return "mp3";
  if (/wav/.test(mimeType)) return "wav";
  if (/ogg/.test(mimeType)) return "ogg";
  return "webm";
}
