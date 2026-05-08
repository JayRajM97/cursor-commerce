const state = {
  catalog: null,
  activeFilter: "All",
  query: "",
  currentProduct: null,
  conciergeResults: null,
  pendingClarification: null,
  chatHistory: [],
  voice: {
    recognition: null,
    recorder: null,
    stream: null,
    chunks: [],
    stopTimer: null,
    audioContext: null,
    analyser: null,
    levelTimer: null,
    maxVolume: 0,
    isListening: false,
    keepAlive: false,
    isSupported: false,
    mode: ""
  },
  memory: loadMemory()
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const COLOR_WORDS = [
  "yellow",
  "blue",
  "green",
  "jade",
  "white",
  "black",
  "grey",
  "gray",
  "pink",
  "gold",
  "silver",
  "brown",
  "clear",
  "multicolor",
  "natural",
  "ivory",
  "navy",
  "purple",
  "red"
];

const CATEGORY_MAP = [
  { pattern: /\bchair[s]?\b|\bseating\b|\bstool[s]?\b|\boffice chair[s]?\b/, tag: "Furniture", label: "chair" },
  { pattern: /\bshoe[s]?\b|\bfootwear\b|\bsneaker[s]?\b|\bboot[s]?\b|\bheels?\b|\bsandal[s]?\b/, tag: "Footwear", label: "footwear" },
  { pattern: /\bcandle[s]?\b/, tag: "Candles", label: "candle" },
  { pattern: /\brug[s]?\b/, tag: "Rugs", label: "rug" },
  { pattern: /\bcurtain[s]?\b|\bdrape[s]?\b|\bblind[s]?\b/, tag: "Curtains", label: "curtain" },
  { pattern: /\bcrystal[s]?\b|\bquartz\b|\bamethyst\b|\bcitrine\b|\bgeode\b/, tag: "Crystals", label: "crystal" },
  { pattern: /\bcloth[es]?\b|\bdress[es]?\b|\btop[s]?\b|\blegging[s]?\b|\bshirt[s]?\b|\bjacket[s]?\b/, tag: "Clothing", label: "clothing" },
  { pattern: /\bplant[s]?\b|\bpotted\b/, tag: "Plants", label: "plant" },
  { pattern: /\bvase[s]?\b/, tag: "Vases", label: "vase" },
  { pattern: /\bcandle[s]?\b/, tag: "Candles", label: "candle" }
];

init();

async function init() {
  try {
    const response = await fetch("/data/products.json");
    if (!response.ok) throw new Error("Catalog failed to load.");
    state.catalog = await response.json();
    bindSearch();

    if (document.body.dataset.page === "product") {
      renderProductPage();
    } else {
      renderMarketplace();
      hydrateDynamicPageFromUrl();
    }
    initConcierge();
  } catch (error) {
    renderError(error);
  }
}

function bindSearch() {
  const input = document.querySelector("#searchInput");
  if (!input) return;

  input.addEventListener("input", () => {
    state.query = input.value.trim().toLowerCase();
    if (document.body.dataset.page === "product") {
      window.location.href = `/marketplace.html?q=${encodeURIComponent(input.value.trim())}`;
      return;
    }
    renderProducts();
  });

  const params = new URLSearchParams(window.location.search);
  const query = params.get("q");
  if (query) {
    input.value = query;
    state.query = query.toLowerCase();
  }
}

function renderMarketplace() {
  renderFilters();
  renderProducts();
}

function renderFilters() {
  const row = document.querySelector("#filterRow");
  if (!row) return;
  const filters = ["All", "Crystals", "Desk Ready", "Room Decor", "Giftable", "Candles", "Beauty", "Footwear", "Review Rich"];

  row.innerHTML = filters
    .map(
      (filter) => `
        <button class="filter-chip${filter === state.activeFilter ? " is-active" : ""}" type="button" data-filter="${escapeHtml(filter)}">
          ${escapeHtml(filter)}
        </button>
      `
    )
    .join("");

  row.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFilter = button.dataset.filter;
      remember("lastFilter", state.activeFilter);
      clearConciergeResults();
      renderFilters();
      renderProducts();
      updateConciergeContext("filter");
    });
  });
}

function renderProducts() {
  const grid = document.querySelector("#productGrid");
  const count = document.querySelector("#catalogCount");
  if (!grid || !state.catalog) return;

  const products = state.conciergeResults?.products || getFilteredProducts();
  if (count) {
    count.textContent = state.conciergeResults
      ? `${products.length} concierge picks`
      : `${products.length} of ${state.catalog.products.length} products`;
  }

  if (!products.length) {
    grid.innerHTML = `<div class="empty-state">No products match this view yet.</div>`;
    return;
  }

  grid.innerHTML = products.map(renderProductCard).join("");
}

function getFilteredProducts() {
  const query = state.query;
  return state.catalog.products.filter((product) => {
    const matchesFilter = state.activeFilter === "All" || product.tags.includes(state.activeFilter);
    const haystack = [
      product.name,
      product.description,
      product.category,
      product.rootCategory,
      product.source,
      product.brand,
      product.tags.join(" "),
      product.colors.join(" "),
      product.useCase,
      product.mood
    ]
      .join(" ")
      .toLowerCase();
    const queryTerms = query.split(/\s+/).filter(Boolean);
    return matchesFilter && (!queryTerms.length || queryTerms.every((term) => haystack.includes(term)));
  });
}

function renderProductPage() {
  const detail = document.querySelector("#productDetail");
  const relatedGrid = document.querySelector("#relatedGrid");
  if (!detail || !relatedGrid || !state.catalog) return;

  const id = getProductId();
  const product = state.catalog.products.find((item) => item.id === id || item.sourceId === id);
  state.currentProduct = product || null;

  if (!product) {
    detail.innerHTML = `<div class="empty-state">Product not found. Open the generated catalog and choose a product.</div>`;
    relatedGrid.innerHTML = state.catalog.products.slice(0, 4).map(renderProductCard).join("");
    return;
  }

  document.title = `${product.name} | Cursor Commerce`;
  remember("lastOpenedProduct", product.id);
  rememberList("viewedProducts", product.id);
  detail.innerHTML = `
    <div class="detail-gallery">
      ${product.images.slice(0, 5).map((image) => renderDetailImage(image, product.name)).join("")}
    </div>
    <article class="detail-copy">
      <div>
        <p class="market-kicker">${escapeHtml(product.source)} / ${escapeHtml(product.category)}</p>
        <h1>${escapeHtml(product.name)}</h1>
      </div>
      <div class="detail-price">${money.format(product.price)}</div>
      <div class="tag-row">${product.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <p class="detail-description">${escapeHtml(product.description)}</p>
      <div class="concierge-card">
        <span>Agent read</span>
        <p>${escapeHtml(getProductRead(product))}</p>
      </div>
      <div class="attribute-card">
        <span>Parsed attributes</span>
        <div class="attribute-grid">
          ${renderAttributes(product)}
        </div>
      </div>
    </article>
  `;

  relatedGrid.innerHTML = getRelated(product).map(renderProductCard).join("");
  renderFloatingDynamicCard();
}

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("id")) return params.get("id");
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

function renderDetailImage(image, name) {
  return `
    <figure class="detail-shot">
      <img src="${escapeAttribute(image)}" alt="${escapeAttribute(name)}" loading="lazy" />
    </figure>
  `;
}

function renderAttributes(product) {
  const basics = [
    { name: "Use case", value: product.useCase },
    { name: "Mood", value: product.mood },
    { name: "Color read", value: product.colors.length ? titleCase(product.colors.join(", ")) : product.color || "Mixed" },
    { name: "Reviews", value: product.reviewCount ? `${product.reviewCount.toLocaleString()} reviews` : "No reviews in CSV" }
  ];
  const attributes = basics.concat(product.attributes || []).slice(0, 8);

  return attributes
    .map(
      (attribute) => `
        <div class="attribute">
          <small>${escapeHtml(attribute.name)}</small>
          <strong>${escapeHtml(attribute.value)}</strong>
        </div>
      `
    )
    .join("");
}

function getRelated(product) {
  return state.catalog.products
    .filter((item) => item.id !== product.id)
    .map((item) => ({
      item,
      score:
        sharedCount(item.tags, product.tags) * 5 +
        (item.category === product.category ? 8 : 0) +
        (item.rootCategory === product.rootCategory ? 4 : 0) +
        sharedCount(item.colors, product.colors) * 3 +
        (item.price <= product.price + 8 ? 1 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((match) => match.item);
}

function getProductRead(product) {
  const name = product.name.toLowerCase();
  if (product.tags.includes("Crystals")) {
    if (name.includes("yellow") || product.colors.includes("yellow")) {
      return "Good choice. Is this for your desk, shelf, or gifting? If it is for a dark desk, I can also show calmer jade and blue pieces.";
    }
    return "Where do you want to keep this crystal? I can match the color and mood to your room, desk, or gifting need.";
  }
  if (product.tags.includes("Desk Ready")) {
    return "This looks desk-friendly. Tell me your desk color and room mood, and I can build a smaller set around it.";
  }
  if (product.tags.includes("Review Rich")) {
    if (product.tags.includes("Clothing")) {
      return "This has enough review data to read fit, comfort, fabric, and sizing risk before you choose.";
    }
    return "This has strong review data. Want me to compare what people liked and what they complained about before you choose?";
  }
  if (product.tags.includes("Footwear")) {
    return "Want to see similar styles by comfort, color, or outfit use? I can narrow this like a shopper would.";
  }
  if (product.tags.includes("Beauty")) {
    return "Want routine-safe options? Share the look or use case and I can compare shades, ingredients, and reviews.";
  }
  return "Should I save this to memory, or show nearby products with a different color, price, or room use?";
}

function initConcierge() {
  syncVisualViewportOffset();
  window.visualViewport?.addEventListener("resize", syncVisualViewportOffset);
  window.visualViewport?.addEventListener("scroll", syncVisualViewportOffset);
  window.addEventListener("resize", syncVisualViewportOffset);

  if (document.querySelector("#conciergeWidget")) {
    updateConciergeContext("init");
    return;
  }

  const widget = document.createElement("aside");
  widget.className = "concierge-widget";
  widget.id = "conciergeWidget";
  widget.innerHTML = `
    <button class="concierge-nudge" id="conciergeNudge" type="button">
      <span class="concierge-dot"></span>
      <span id="conciergeNudgeText"></span>
    </button>
    <form class="concierge-form" id="conciergeForm">
      <label class="concierge-input-wrap">
        <span id="conciergeLabel">Ask the concierge</span>
        <input id="conciergeInput" type="text" autocomplete="off" />
      </label>
      <button class="concierge-voice" id="conciergeVoice" type="button" aria-label="Record voice command">
        <svg class="concierge-mic-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <span class="concierge-voice-label">Voice</span>
      </button>
      <button class="concierge-submit" type="submit">Ask</button>
    </form>
    <div class="concierge-voice-status" id="conciergeVoiceStatus" aria-live="polite"></div>
    <div class="concierge-reply" id="conciergeReply" aria-live="polite"></div>
    <div class="concierge-dynamic-card" id="conciergeDynamicCard"></div>
  `;
  document.body.appendChild(widget);

  document.querySelector("#conciergeNudge").addEventListener("click", () => {
    widget.classList.toggle("is-open");
    document.querySelector("#conciergeInput")?.focus();
  });

  document.querySelector("#conciergeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#conciergeInput");
    const query = input.value.trim();
    if (!query) return;
    input.value = "";
    showConciergeSayLoading();
    const action = await runConcierge(query, { speak: false, syncUrl: true });
    renderConciergeReply(action);
  });

  initVoiceControls();
  setTimeout(() => updateConciergeContext("dwell"), 1800);
  updateConciergeContext("init");
}

function syncVisualViewportOffset() {
  const offset = Math.max(0, window.innerHeight - (window.visualViewport?.height || window.innerHeight));
  document.documentElement.style.setProperty("--cc-visual-offset", `${Math.round(offset)}px`);
}

function initVoiceControls() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = document.querySelector("#conciergeVoice");
  const status = document.querySelector("#conciergeVoiceStatus");
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  state.voice.isSupported = canRecord || Boolean(Recognition);
  if (!voiceButton) return;

  if (!state.voice.isSupported) {
    voiceButton.disabled = true;
    voiceButton.textContent = "No voice";
    if (status) status.textContent = "Voice input is not supported in this browser.";
    return;
  }

  if (status) status.textContent = "";

  if (Recognition) {
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    state.voice.recognition = recognition;

    recognition.addEventListener("start", () => {
      state.voice.isListening = true;
      state.voice.mode = "speech";
      voiceButton.classList.add("is-listening");
      setVoiceLabel(voiceButton, "Stop");
      if (status) status.textContent = "Listening — say what you want to see.";
    });

    recognition.addEventListener("result", (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      const input = document.querySelector("#conciergeInput");
      if (input) input.value = transcript;
      const finalResult = Array.from(event.results).some((result) => result.isFinal);
      if (finalResult && transcript) submitVoiceQuery(transcript);
    });

    recognition.addEventListener("error", (event) => {
      stopVoiceUi();
      if (status) {
        status.textContent =
          event.error === "not-allowed" ? "Mic permission is blocked." : "Voice did not catch that. Try recording mode.";
      }
    });

    recognition.addEventListener("end", stopVoiceUi);
  }

  voiceButton.addEventListener("click", () => toggleVoice());
  window.addEventListener(
    "scroll",
    () => {
      if (window.scrollY > 360 && !state.currentProduct) updateConciergeContext("scroll");
    },
    { passive: true }
  );
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || isTypingTarget(event.target)) return;
    event.preventDefault();
    if (event.repeat) return;
    openConciergeWidget();
    startVoice();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space" || isTypingTarget(event.target)) return;
    event.preventDefault();
    stopVoice();
  });
}

function toggleVoice() {
  if (state.voice.keepAlive || state.voice.isListening) stopVoiceSession();
  else {
    openConciergeWidget();
    state.voice.keepAlive = true;
    startVoice();
  }
}

function startVoice() {
  if (state.voice.isListening) return;
  if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
    startAudioRecording();
    return;
  }
  if (!state.voice.recognition) return;
  try {
    state.voice.recognition.start();
  } catch {
    stopVoiceUi();
  }
}

function stopVoice() {
  if (!state.voice.isListening) return;
  if (state.voice.mode === "record") {
    stopAudioRecording();
    return;
  }
  if (!state.voice.recognition) return;
  state.voice.recognition.stop();
}

function stopVoiceSession() {
  state.voice.keepAlive = false;
  stopVoice();
  const voiceButton = document.querySelector("#conciergeVoice");
  const status = document.querySelector("#conciergeVoiceStatus");
  voiceButton?.classList.remove("is-live");
  setVoiceLabel(voiceButton, "Voice");
  if (status) status.textContent = "";
}

function setVoiceLabel(btn, label) {
  const span = btn?.querySelector(".concierge-voice-label");
  if (span) span.textContent = label;
  else if (btn) btn.textContent = label;
}

function stopVoiceUi() {
  state.voice.isListening = false;
  state.voice.mode = "";
  const voiceButton = document.querySelector("#conciergeVoice");
  const status = document.querySelector("#conciergeVoiceStatus");
  voiceButton?.classList.remove("is-listening");
  if (voiceButton && !voiceButton.disabled) {
    setVoiceLabel(voiceButton, state.voice.keepAlive ? "End" : "Voice");
    voiceButton.classList.toggle("is-live", state.voice.keepAlive);
  }
  if (status && status.textContent.startsWith("Listening")) status.textContent = "";
}

async function startAudioRecording() {
  const voiceButton = document.querySelector("#conciergeVoice");
  const status = document.querySelector("#conciergeVoiceStatus");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getRecorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.voice.stream = stream;
    state.voice.recorder = recorder;
    state.voice.chunks = [];
    state.voice.maxVolume = 0;
    state.voice.isListening = true;
    state.voice.mode = "record";
    startVoiceLevelMeter(stream);
    voiceButton?.classList.remove("is-live");
    voiceButton?.classList.add("is-listening");
    if (voiceButton) setVoiceLabel(voiceButton, "Stop");
    if (status) status.textContent = "Recording — speak now. Stops in 7 s.";

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) state.voice.chunks.push(event.data);
    });
    recorder.addEventListener("stop", handleRecordingStopped, { once: true });
    recorder.start();
    state.voice.stopTimer = window.setTimeout(stopAudioRecording, 7000);
  } catch (error) {
    stopVoiceUi();
    if (status) {
      status.textContent =
        error?.name === "NotAllowedError" ? "Mic permission is blocked." : "Could not start microphone recording.";
    }
  }
}

function stopAudioRecording() {
  window.clearTimeout(state.voice.stopTimer);
  state.voice.stopTimer = null;
  if (state.voice.recorder && state.voice.recorder.state !== "inactive") {
    state.voice.recorder.stop();
  } else {
    stopVoiceUi();
    restartContinuousVoice();
  }
}

async function handleRecordingStopped() {
  const status = document.querySelector("#conciergeVoiceStatus");
  const chunks = state.voice.chunks.slice();
  const mimeType = state.voice.recorder?.mimeType || getRecorderMimeType() || "audio/webm";
  const maxVolume = state.voice.maxVolume;

  cleanupAudioStream();
  // stopVoiceUi: clears is-listening, sets is-live when keepAlive=true
  stopVoiceUi();

  if (!chunks.length) {
    if (status) status.textContent = state.voice.keepAlive ? "Didn't catch that — try again." : "";
    restartContinuousVoice();
    return;
  }

  if (maxVolume < 0.018) {
    if (status) status.textContent = state.voice.keepAlive ? "Too quiet — speak closer to mic." : "";
    restartContinuousVoice();
    return;
  }

  if (status) status.textContent = "Heard you...";
  try {
    const audio = await blobToInlineData(new Blob(chunks, { type: mimeType }));
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio })
    });
    const result = await response.json();
    if (!response.ok || !result.transcript) {
      throw new Error(result.error || "Could not transcribe audio.");
    }
    const input = document.querySelector("#conciergeInput");
    if (input) input.value = result.transcript;
    // submitVoiceQuery owns the full loop: LLM → TTS → restart
    submitVoiceQuery(result.transcript);
  } catch (error) {
    if (status) status.textContent = getFriendlyTranscriptionError(error);
    state.voice.keepAlive = false;
  }
}

function restartContinuousVoice() {
  if (!state.voice.keepAlive) return;
  window.setTimeout(() => {
    if (state.voice.keepAlive && !state.voice.isListening) startVoice();
  }, 650);
}

function cleanupAudioStream() {
  window.clearInterval(state.voice.levelTimer);
  state.voice.levelTimer = null;
  state.voice.audioContext?.close?.();
  state.voice.audioContext = null;
  state.voice.analyser = null;
  state.voice.stream?.getTracks().forEach((track) => track.stop());
  state.voice.stream = null;
  state.voice.recorder = null;
  state.voice.chunks = [];
}

function startVoiceLevelMeter(stream) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    state.voice.audioContext = audioContext;
    state.voice.analyser = analyser;
    state.voice.levelTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample - 128) / 128);
      }
      state.voice.maxVolume = Math.max(state.voice.maxVolume, peak);
    }, 120);
  } catch {
    state.voice.maxVolume = 1;
  }
}

function getFriendlyTranscriptionError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/quota|rate limit|billing|free_tier/i.test(message)) {
    return "Voice transcription quota is exhausted. For this demo, type the same request and press Ask, or add billing/use another STT key.";
  }
  return message || "Voice transcription failed. Try typing the request once.";
}

function getRecorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

function blobToInlineData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = String(reader.result || "");
      const [prefix, data] = result.split(",");
      const mimeType = prefix.match(/^data:(.*?);base64$/)?.[1] || blob.type || "audio/webm";
      resolve({ mimeType, data });
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read audio.")));
    reader.readAsDataURL(blob);
  });
}

async function submitVoiceQuery(query) {
  const input = document.querySelector("#conciergeInput");
  if (input) input.value = "";
  const status = document.querySelector("#conciergeVoiceStatus");

  showConciergeSayLoading();
  if (status) status.textContent = "Thinking...";

  try {
    const action = await runConcierge(query, { speak: false, syncUrl: true });
    renderConciergeReply(action);
    if (action.say) {
      if (status) status.textContent = "Speaking...";
      await speakConcierge(action.say);
    }
  } catch {
    if (status) status.textContent = "Couldn't get a reply — try again.";
  }

  // Restart always runs — error must not kill the live session
  if (state.voice.keepAlive) {
    const btn = document.querySelector("#conciergeVoice");
    btn?.classList.add("is-live");
    btn?.classList.remove("is-listening");
    if (status) status.textContent = "Listening...";
    setVoiceLabel(btn, "End");
    restartContinuousVoice();
  } else {
    if (status) status.textContent = "";
  }
}

async function speakConcierge(text) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 200), voice: "nova" })
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    return new Promise((resolve) => {
      audio.addEventListener("ended", resolve, { once: true });
      audio.addEventListener("error", resolve, { once: true });
      audio.play().catch(resolve);
    });
  } catch {
    // TTS is best-effort
  }
}

function openConciergeWidget() {
  document.querySelector("#conciergeWidget")?.classList.add("is-open");
}

function isTypingTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
}

function updateConciergeContext(reason) {
  const context = getConciergeContext(reason);
  const nudge = document.querySelector("#conciergeNudgeText");
  const input = document.querySelector("#conciergeInput");
  const label = document.querySelector("#conciergeLabel");
  if (nudge) nudge.textContent = context.nudge;
  if (input) input.placeholder = context.placeholder;
  if (label) label.textContent = context.label;
  document.querySelector("#conciergeWidget")?.classList.toggle("has-nudge", Boolean(context.nudge));
}

function getConciergeContext(reason = "init") {
  const product = state.currentProduct;
  if (product) {
    return {
      label: product.tags.includes("Review Rich") ? "Ask from reviews" : "Ask about this product",
      nudge: getProductNudge(product, reason),
      placeholder: getProductPlaceholder(product)
    };
  }

  const visible = getFilteredProducts();
  const topTags = getTopTags(visible);
  const primary = topTags[0] || state.activeFilter;
  return {
    label: "Ask the catalog",
    nudge: getCatalogNudge(primary, visible.length, reason),
    placeholder: getCatalogPlaceholder(primary)
  };
}

function getProductNudge(product, reason) {
  if (reason === "dwell") {
    if (product.tags.includes("Crystals")) return "Still considering it? Ask where this crystal would work best.";
    if (product.tags.includes("Clothing")) return `Still considering it? Ask what reviews say about fit and sizing for this ${product.category.toLowerCase()}.`;
    if (product.tags.includes("Review Rich")) return "Want the review read before choosing?";
    if (product.tags.includes("Footwear")) return "Ask what color or comfort profile to compare.";
  }
  if (product.tags.includes("Crystals")) {
    return `Ask if this ${product.mood.toLowerCase()} crystal works for your desk or shelf.`;
  }
  if (product.tags.includes("Desk Ready")) return "Ask what would work around this on your desk.";
  if (product.tags.includes("Clothing")) return `Ask about fit, fabric, or sizing for this ${product.category.toLowerCase()}.`;
  if (product.tags.includes("Review Rich")) return "Ask what reviewers loved and disliked.";
  if (product.tags.includes("Beauty")) return "Ask how this fits a routine or shade need.";
  if (product.tags.includes("Footwear")) return "Ask for similar fit, color, or outfit options.";
  return `Ask for alternatives to this ${product.category.toLowerCase()}.`;
}

function getProductPlaceholder(product) {
  if (product.tags.includes("Crystals")) return "Try: it is for my dark wood desk";
  if (product.tags.includes("Review Rich")) return "Try: summarize the review risk";
  if (product.tags.includes("Clothing")) return "Try: what do reviews say about fit?";
  if (product.tags.includes("Beauty")) return "Try: compare for everyday use";
  if (product.tags.includes("Footwear")) return "Try: show easier everyday options";
  if (product.tags.includes("Desk Ready")) return "Try: what would work on my desk?";
  return `Try: show similar ${product.category.toLowerCase()} under $20`;
}

function getCatalogNudge(primary, count, reason) {
  if (state.query) return `${count} matches. Ask me to narrow by color, price, room, or use.`;
  if (reason === "init") return "";
  if (primary === "Crystals") return "Ask for crystals by room, color, mood, or budget.";
  if (primary === "Review Rich") return "Ask me to sort by reviews and risk.";
  if (primary === "Footwear") return "Ask for everyday shoes by color or comfort.";
  if (reason === "filter") return `Now viewing ${primary.toLowerCase()}. Ask for a sharper set.`;
  if (primary && primary !== "All") return `Browsing ${primary.toLowerCase()}. I can narrow this by budget, color, fit, or use.`;
  return count ? `${count} products loaded. Open a product and I will respond to that context.` : "";
}

function getCatalogPlaceholder(primary) {
  if (primary === "Crystals") return "Try: blue crystals under $20 for my desk";
  if (primary === "Beauty") return "Try: easy everyday beauty picks";
  if (primary === "Footwear") return "Try: comfortable black shoes";
  if (primary === "Review Rich") return "Try: highest rated home items";
  return "Try: calm desk decor under $20";
}

function shouldAskClarification(intent) {
  if (intent.colors.length || intent.maxPrice || intent.useCase) return false;
  if (intent.wantsCalm || intent.wantsReview || intent.wantsCheaper) return false;
  return Boolean(intent.categoryFilter);
}

async function fetchClarifyingQuestion(query, baseProduct) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: query }],
        catalogContext: {
          query,
          clarifyMode: true,
          baseCategory: baseProduct?.category || ""
        }
      })
    });
    const data = await res.json();
    if (res.ok && data.reply) return data.reply;
  } catch {}
  return "What will you use it for — work, casual, or a specific room?";
}

async function runConcierge(query, options = {}) {
  const settings = { syncUrl: false, speak: false, ...options };

  // Merge previous clarification question with user's answer
  let effectiveQuery = query;
  let answeredClarification = false;
  if (state.pendingClarification) {
    effectiveQuery = `${state.pendingClarification} ${query}`.trim();
    state.pendingClarification = null;
    answeredClarification = true;
  }

  const intent = parseConciergeIntent(effectiveQuery);
  // Resolve "this / it" to the top concierge result when no explicit product open
  const refersToThis = /\b(this|it)\b/i.test(effectiveQuery);
  const baseProduct = state.currentProduct || (refersToThis && state.conciergeResults?.products?.[0]) || null;

  // Ask one clarifying question before showing products for vague browse requests
  if (!answeredClarification && shouldAskClarification(intent)) {
    state.pendingClarification = effectiveQuery;
    const question = await fetchClarifyingQuestion(effectiveQuery, baseProduct);
    const result = { say: question, products: [], pageTitle: "One quick question" };
    state.conciergeResults = { query: effectiveQuery, intent, products: [], pageTitle: result.pageTitle, say: question };
    state.chatHistory.push({ role: "user", content: effectiveQuery });
    state.chatHistory.push({ role: "assistant", content: question });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
    if (document.body.dataset.page !== "marketplace") renderFloatingDynamicCard();
    updateConciergeContext("answer");
    if (settings.speak) await speakConcierge(question);
    return result;
  }

  const pool = baseProduct ? getRelatedPool(baseProduct) : state.catalog.products;
  const products = rankForIntent(pool, intent, baseProduct).slice(0, 8);
  const pageTitle = getDynamicTitle(intent, baseProduct);
  const voiceMode = state.voice.keepAlive;
  const say = await fetchConciergeSay(intent, baseProduct, products, query, voiceMode);

  state.chatHistory.push({ role: "user", content: query });
  state.chatHistory.push({ role: "assistant", content: say });
  if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);

  state.conciergeResults = { query, intent, products, pageTitle, say };
  remember("lastIntent", intent.intent || query);
  if (intent.useCase) remember("useCase", intent.useCase);
  if (intent.surface) remember("surface", intent.surface);
  if (intent.room) remember("room", intent.room);
  if (intent.colors.length) rememberList("likedColors", intent.colors);

  if (document.body.dataset.page === "marketplace") {
    renderProducts();
    if (settings.syncUrl) syncDynamicPageUrl(query);
  } else {
    renderFloatingDynamicCard();
  }

  updateConciergeContext("answer");
  if (settings.speak) speakConcierge(say);
  return { say, products, pageTitle };
}

function parseConciergeIntent(query) {
  const lower = query.toLowerCase();
  const colors = COLOR_WORDS.filter((color) => lower.includes(color));
  const maxPriceMatch = lower.match(/(?:under|below|less than|upto|up to)\s*\$?(\d+)/);
  let useCase = "";
  if (lower.includes("desk") || lower.includes("office") || lower.includes("workspace")) useCase = "desk decor";
  if (lower.includes("shelf")) useCase = "shelf decor";
  if (lower.includes("gift")) useCase = "gift";
  if (lower.includes("room") || lower.includes("bedroom") || lower.includes("living")) useCase = "room decor";

  const categoryMatch = CATEGORY_MAP.find((c) => c.pattern.test(lower));

  return {
    raw: query,
    intent: lower,
    colors,
    maxPrice: maxPriceMatch ? Number(maxPriceMatch[1]) : null,
    useCase,
    surface: lower.includes("dark wood") || lower.includes("brown desk") ? "dark wood desk" : lower.includes("desk") ? "desk" : "",
    room: lower.includes("white room") ? "white room" : lower.includes("bedroom") ? "bedroom" : "",
    wantsCheaper: /\b(cheap|cheaper|under|below|budget)\b/.test(lower),
    wantsCalm: /\b(calm|calmer|subtle|soft|peaceful|minimal)\b/.test(lower),
    wantsReview: /\b(review|rating|risk|complain|liked|disliked)\b/.test(lower),
    wantsSimilar: /\b(similar|more like|alternative|another|different)\b/.test(lower),
    categoryFilter: categoryMatch?.tag || "",
    categoryLabel: categoryMatch?.label || ""
  };
}

function rankForIntent(products, intent, baseProduct) {
  return products
    .map((product) => {
      const haystack = getProductHaystack(product);
      let score = 0;
      if (baseProduct && product.id !== baseProduct.id) {
        score += sharedCount(product.tags, baseProduct.tags) * 6;
        score += product.category === baseProduct.category ? 10 : 0;
        score += product.rootCategory === baseProduct.rootCategory ? 4 : 0;
      }
      for (const color of intent.colors) {
        if (product.colors.includes(color) || haystack.includes(color)) score += 16;
      }
      if (intent.maxPrice && product.price <= intent.maxPrice) score += 24;
      if (intent.useCase.includes("desk") && product.tags.includes("Desk Ready")) score += 26;
      if (intent.useCase.includes("gift") && product.tags.includes("Giftable")) score += 22;
      if (intent.useCase.includes("room") && product.tags.includes("Room Decor")) score += 20;
      if (intent.wantsCalm && ["Calm", "Minimal", "Natural"].includes(product.mood)) score += 20;
      if (intent.wantsReview && product.reviewCount > 1000) score += 28;
      if (intent.wantsCheaper) score += Math.max(0, 22 - product.price);
      if (intent.categoryFilter) {
        const cat = intent.categoryFilter.toLowerCase();
        const label = intent.categoryLabel.toLowerCase();
        if (
          product.tags.some((t) => t.toLowerCase() === cat) ||
          product.category.toLowerCase().includes(label) ||
          product.category.toLowerCase().includes(cat) ||
          product.rootCategory.toLowerCase().includes(cat) ||
          haystack.includes(label)
        ) {
          score += 50;
        }
      }
      score += Math.max(0, 12 - product.rank / 10);
      return { product, score };
    })
    .filter(({ product, score }) => score > 0 || !baseProduct || product.id !== baseProduct.id)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}

function getRelatedPool(product) {
  const sameWorld = state.catalog.products.filter(
    (item) =>
      item.id !== product.id &&
      (item.rootCategory === product.rootCategory ||
        item.category === product.category ||
        sharedCount(item.tags, product.tags) > 0)
  );
  return sameWorld.length >= 8 ? sameWorld : state.catalog.products.filter((item) => item.id !== product.id);
}

function getDynamicTitle(intent, product) {
  if (intent.useCase && intent.colors.length) return `${titleCase(intent.colors.join(" and "))} ${intent.useCase} picks`;
  if (intent.useCase) return `${titleCase(intent.useCase)} picks`;
  if (intent.wantsReview) return "Review-backed picks";
  if (intent.wantsCalm) return "Calmer alternatives";
  if (intent.maxPrice) return `Products under $${intent.maxPrice}`;
  if (product) return `Alternatives to this ${product.category}`;
  return "Concierge picks";
}

async function fetchConciergeSay(intent, product, products, rawQuery, voiceMode = false) {
  if (!products.length) return "Nothing matched that search — try a broader color, category, or price.";

  const topProducts = products.slice(0, 4).map((p) => ({
    name: p.name.split(" ").slice(0, 6).join(" "),
    price: p.price,
    mood: p.mood,
    category: p.category,
    colors: p.colors.slice(0, 2)
  }));

  try {
    const historyMessages = state.chatHistory.slice(-6);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...historyMessages, { role: "user", content: rawQuery }],
        catalogContext: {
          query: rawQuery,
          topProducts,
          totalCount: products.length,
          followUp: voiceMode && products.length >= 2
        }
      })
    });
    const data = await res.json();
    if (res.ok && data.reply) return data.reply;
  } catch {
    // fall through to local fallback
  }

  // Fallback: natural local summary without jargon
  const first = products[0];
  const firstName = first.name.split(" ").slice(0, 5).join(" ");
  if (intent.maxPrice) return `${products.length} picks under $${intent.maxPrice} — ${firstName} is the top one.`;
  if (intent.useCase.includes("gift")) return `${products.length} gift-ready picks — ${firstName} leads.`;
  if (product) return `${products.length} picks close to this ${product.category.toLowerCase()} — starting with ${firstName}.`;
  return `${products.length} picks for "${rawQuery}" — ${firstName} is the best match.`;
}

function showConciergeSayLoading() {
  const reply = document.querySelector("#conciergeReply");
  if (!reply) return;
  reply.innerHTML = `<p class="concierge-thinking"><span></span><span></span><span></span></p>`;
}

function renderConciergeReply(action) {
  const reply = document.querySelector("#conciergeReply");
  if (!reply) return;
  const picks = (action.products || []).slice(0, 5);
  const cardsHtml = picks.length
    ? `<div class="cc-reply-cards">${picks
        .map(
          (p) => `
        <a class="cc-reply-card" href="/product/${encodeURIComponent(p.id)}" title="${escapeAttribute(p.name)}">
          <span class="cc-reply-card-img"><img src="${escapeAttribute(p.image)}" alt="${escapeAttribute(p.name)}" loading="lazy" /></span>
          <span class="cc-reply-card-meta">
            <span class="cc-reply-card-name">${escapeHtml(p.name.split(" ").slice(0, 5).join(" "))}</span>
            <span class="cc-reply-card-price">${money.format(p.price)}</span>
          </span>
        </a>`
        )
        .join("")}</div>`
    : "";
  reply.innerHTML = `
    <strong>${escapeHtml(action.pageTitle)}</strong>
    <p>${escapeHtml(action.say)}</p>
    ${cardsHtml}
  `;
}

function renderFloatingDynamicCard() {
  const container = document.querySelector("#conciergeDynamicCard");
  if (!container) return;
  if (!state.conciergeResults) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <section class="concierge-results">
      <div>
        <span>Dynamic page</span>
        <h2>${escapeHtml(state.conciergeResults.pageTitle)}</h2>
        <p>${escapeHtml(state.conciergeResults.say)}</p>
      </div>
      <div class="concierge-result-actions">
        ${renderDynamicPageAction(state.conciergeResults.query)}
        <button type="button" id="clearConciergeResults">Clear</button>
      </div>
    </section>
  `;
  container.querySelector("#copyDynamicPage")?.addEventListener("click", () => {
    copyDynamicPageLink(state.conciergeResults.query);
  });
  container.querySelector("#clearConciergeResults")?.addEventListener("click", () => {
    clearConciergeResults();
    if (document.body.dataset.page === "marketplace") renderProducts();
    else renderFloatingDynamicCard();
  });
}

function clearConciergeResults() {
  state.conciergeResults = null;
  if (document.body.dataset.page === "marketplace") {
    const url = new URL(window.location.href);
    url.searchParams.delete("cc");
    window.history.replaceState({}, "", url);
  }
  renderFloatingDynamicCard();
}

async function hydrateDynamicPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("cc");
  if (!encoded) return;
  const decoded = decodeDynamicQuery(encoded);
  if (!decoded) return;

  let query = decoded;
  if (decoded.includes("\x00")) {
    const [q, productId] = decoded.split("\x00");
    query = q;
    state.currentProduct = state.catalog.products.find((p) => p.id === productId) || null;
  }

  showConciergeSayLoading();
  const action = await runConcierge(query, { syncUrl: false, speak: false });
  renderConciergeReply(action);
}

function syncDynamicPageUrl(query) {
  if (document.body.dataset.page !== "marketplace") return;
  const url = new URL(window.location.href);
  url.pathname = "/marketplace.html";
  url.searchParams.delete("q");
  url.searchParams.set("cc", encodeDynamicQuery(query));
  window.history.replaceState({}, "", url);
}

function renderDynamicPageAction(query) {
  if (!state.conciergeResults?.products?.length) return "";
  const payload = state.currentProduct ? `${query}\x00${state.currentProduct.id}` : query;
  const href = `/marketplace.html?cc=${encodeURIComponent(encodeDynamicQuery(payload))}`;
  if (document.body.dataset.page === "product") {
    return `<a href="${escapeAttribute(href)}">Open page</a>`;
  }
  return `<button type="button" id="copyDynamicPage">Copy link</button>`;
}

async function copyDynamicPageLink(query) {
  const url = `${window.location.origin}/marketplace.html?cc=${encodeURIComponent(encodeDynamicQuery(query))}`;
  try {
    await navigator.clipboard.writeText(url);
    const reply = document.querySelector("#conciergeReply");
    if (reply) {
      reply.innerHTML = `<strong>Link copied</strong><p>This dynamic page can be opened directly.</p>`;
    }
  } catch {
    window.prompt("Copy this dynamic page link", url);
  }
}

function encodeDynamicQuery(query) {
  return btoa(unescape(encodeURIComponent(query)));
}

function decodeDynamicQuery(value) {
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return "";
  }
}

function getProductHaystack(product) {
  return [
    product.name,
    product.description,
    product.category,
    product.rootCategory,
    product.source,
    product.brand,
    product.tags.join(" "),
    product.colors.join(" "),
    product.useCase,
    product.mood
  ]
    .join(" ")
    .toLowerCase();
}

function getTopTags(products) {
  const counts = new Map();
  products.forEach((product) => {
    product.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem("ccConciergeMemory") || "{}");
  } catch {
    return {};
  }
}

function saveMemory() {
  localStorage.setItem("ccConciergeMemory", JSON.stringify(state.memory));
}

function remember(key, value) {
  state.memory[key] = value;
  saveMemory();
}

function rememberList(key, value) {
  const values = Array.isArray(value) ? value : [value];
  state.memory[key] = Array.from(new Set([...(state.memory[key] || []), ...values])).slice(-12);
  saveMemory();
}

function renderProductCard(product) {
  const reviewLine = product.reviewCount > 0
    ? `<div class="product-rating">
        <span class="product-stars">${"★".repeat(Math.round(product.rating || 0))}${"☆".repeat(5 - Math.round(product.rating || 0))}</span>
        <span class="product-review-count">${product.reviewCount >= 1000 ? (product.reviewCount / 1000).toFixed(1) + "k" : product.reviewCount}</span>
      </div>`
    : "";
  return `
    <article class="product-card">
      <a class="product-image" href="/product/${encodeURIComponent(product.id)}" aria-label="${escapeAttribute(product.name)}">
        <img src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)}" loading="lazy" />
        <span class="source-pill">${escapeHtml(product.source)}</span>
      </a>
      <div class="product-info">
        <div class="product-title-row">
          <h3 class="product-title">
            <a href="/product/${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a>
          </h3>
          <span class="product-price">${money.format(product.price)}</span>
        </div>
        ${reviewLine}
        <div class="product-sub">${escapeHtml(product.category)} · ${escapeHtml(product.mood)}</div>
        <div class="tag-row">${product.tags.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    </article>
  `;
}

function sharedCount(first, second) {
  return first.filter((value) => second.includes(value)).length;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderError(error) {
  const shell = document.querySelector(".market-shell");
  if (!shell) return;
  shell.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Something went wrong.")}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
