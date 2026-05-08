const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const MAX_MESSAGES = 10;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: "Missing OPENAI_API_KEY environment variable." });
    return;
  }

  const { messages, productContext, signals, catalogContext } = request.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    sendJson(response, 400, { error: "messages array is required." });
    return;
  }

  const systemPrompt = buildSystemPrompt(productContext, signals, catalogContext);

  const safeMessages = messages
    .slice(-MAX_MESSAGES)
    .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content).slice(0, 800) }));

  if (!safeMessages.length) {
    sendJson(response, 400, { error: "No valid messages provided." });
    return;
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
        max_tokens: 120,
        temperature: 0.7
      })
    });

    const result = await openaiResponse.json();
    if (!openaiResponse.ok) {
      const message = result?.error?.message || "OpenAI chat failed.";
      console.error(`[chat] OpenAI ${OPENAI_CHAT_MODEL} failed with ${openaiResponse.status}: ${message}`);
      sendJson(response, openaiResponse.status, { error: message, model: OPENAI_CHAT_MODEL });
      return;
    }

    const reply = result?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      sendJson(response, 502, { error: "No reply from model." });
      return;
    }

    sendJson(response, 200, { reply, model: OPENAI_CHAT_MODEL });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected chat error." });
  }
};

function buildSystemPrompt(product, signals, catalogContext) {
  // Clarification mode: ask one targeted question before suggesting products
  if (catalogContext?.clarifyMode) {
    const { query, baseCategory } = catalogContext;
    const context = baseCategory ? ` (looking at "${baseCategory}" product)` : "";
    return [
      `Shopper asked: "${query}"${context}.`,
      "Ask them ONE short, direct question to understand their specific need or use case.",
      "Max 12 words. No greeting, no intro, just the question."
    ].join(" ");
  }

  // Marketplace narration mode: short, specific, natural
  if (catalogContext) {
    const { query, topProducts, totalCount, followUp } = catalogContext;
    const count = totalCount || topProducts?.length || 0;
    const list = (topProducts || [])
      .slice(0, 4)
      .map((p) => {
        const parts = [p.name];
        if (p.price) parts.push(`$${p.price}`);
        if (p.mood) parts.push(p.mood.toLowerCase());
        if (p.colors?.length) parts.push(p.colors.slice(0, 2).join("/"));
        return parts.join(", ");
      })
      .join("; ");
    return [
      `Shopper asked: "${query}". You found ${count} product${count !== 1 ? "s" : ""}.`,
      list ? `Top matches: ${list}.` : "",
      "Write exactly ONE natural, specific sentence (max 20 words) telling the shopper what you found.",
      "Name a standout product or key attribute. Never say 'signals', 'options', 'nearby', or 'matching'. Sound like a knowledgeable friend who just looked through the shelf.",
      followUp ? "Then add one short follow-up question (max 8 words) to help them narrow further." : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  const parts = [
    "You are a helpful, concise shopping companion embedded on an ecommerce product page.",
    "You speak directly to the shopper. No filler words, no sycophancy. Max 2 sentences per reply."
  ];

  if (product) {
    const { title, price, colors, tags, reviewCount, rating, mood, category } = product;
    const productLine = [
      title && `Product: ${title}`,
      price && `Price: ${price}`,
      category && `Category: ${category}`,
      mood && `Mood: ${mood}`,
      colors?.length && `Colors: ${colors.join(", ")}`,
      tags?.length && `Tags: ${tags.join(", ")}`,
      reviewCount > 0 && `Reviews: ${reviewCount} (${rating}/5)`
    ]
      .filter(Boolean)
      .join(". ");
    if (productLine) parts.push(productLine);
  }

  if (signals) {
    const { dwellSeconds, hoveredSizes, useCase, forSelf } = signals;
    const signalLine = [
      dwellSeconds > 5 && `Shopper has been on page ${dwellSeconds}s`,
      hoveredSizes?.length && `Hovered sizes: ${hoveredSizes.join(", ")}`,
      useCase && `Use case: ${useCase}`,
      typeof forSelf === "boolean" && (forSelf ? "Shopping for themselves" : "Shopping as a gift")
    ]
      .filter(Boolean)
      .join(". ");
    if (signalLine) parts.push(`Shopper signals: ${signalLine}.`);
  }

  parts.push("Answer fit, size, style, and product questions honestly. If unsure, say so briefly.");
  return parts.join(" ");
}
