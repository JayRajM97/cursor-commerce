const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation";
const MAX_BASE64_LENGTH = 3.5 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function isValidImagePart(part) {
  return (
    part &&
    typeof part.data === "string" &&
    part.data.length > 0 &&
    part.data.length <= MAX_BASE64_LENGTH &&
    typeof part.mimeType === "string" &&
    /^image\/(png|jpe?g|webp)$/i.test(part.mimeType)
  );
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: "Missing GEMINI_API_KEY environment variable." });
    return;
  }

  const { userImage, productImage, productTitle } = request.body || {};
  if (!isValidImagePart(userImage) || !isValidImagePart(productImage)) {
    sendJson(response, 400, { error: "Upload one customer photo and include the product image." });
    return;
  }

  const safeTitle = String(productTitle || "the product").slice(0, 120);
  const prompt = [
    `Virtual try-on task for ecommerce.`,
    `Image 1 is the shopper photo. Image 2 is the product reference: ${safeTitle}.`,
    `Put the black tank top garment from Image 2 onto the person in Image 1.`,
    `Use only the tank top as the try-on product; do not add the shorts from the product reference unless they are already in Image 1.`,
    `Preserve the shopper's face, identity, skin tone, body shape, pose, hands, hair, and background as much as possible.`,
    `Replace or overlay only the relevant upper-body clothing area so the result looks like the shopper is wearing this tank top.`,
    `Keep the garment black with the same neckline, straps, logo placement, and fitted athletic silhouette.`,
    `Do not add text, labels, watermarks, extra people, body-shaming language, medical claims, or sizing claims.`,
    `If the uploaded photo angle makes the try-on imperfect, still return the most realistic honest visual preview possible.`
  ].join(" ");

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
                { text: prompt },
                {
                  inline_data: {
                    mime_type: userImage.mimeType,
                    data: userImage.data
                  }
                },
                {
                  inline_data: {
                    mime_type: productImage.mimeType,
                    data: productImage.data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "3:4"
            }
          }
        })
      }
    );

    const result = await geminiResponse.json();
    if (!geminiResponse.ok) {
      const message = result?.error?.message || "Gemini image generation failed.";
      console.error(`[try-on] Gemini ${GEMINI_MODEL} failed with ${geminiResponse.status}: ${message}`);
      sendJson(response, geminiResponse.status, {
        error: /quota|rate limit|billing/i.test(message)
          ? `${message} You can either enable billing for Nano Banana / Gemini 2.5 image, or keep using the Gemini 2.0 image model by leaving GEMINI_IMAGE_MODEL unset.`
          : message,
        model: GEMINI_MODEL
      });
      return;
    }

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData || part.inline_data);
    const text = parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();

    const inlineData = imagePart?.inlineData || imagePart?.inline_data;
    if (!inlineData?.data) {
      sendJson(response, 502, {
        error: text || "Gemini responded without an image. Try a clearer front-facing photo or a simpler product image."
      });
      return;
    }

    sendJson(response, 200, {
      image: `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`,
      text,
      model: GEMINI_MODEL
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected try-on error."
    });
  }
};
