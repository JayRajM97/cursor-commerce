(() => {
  const ASSISTANT_ID = "hfa-root";
  const SIZE_WORDS = new Set(["xxs", "xs", "s", "m", "l", "xl", "xxl", "2xl", "3xl"]);

  const state = {
    product: null,
    lastMouse: { x: 26, y: 130 },
    lastPrompt: null,
    panelMode: "fit",
    sizeSignals: 0,
    lastSizeSignalAt: 0,
    currentHoverType: "other",
    sizeHoverTimer: null,
    imageHoverTimer: null,
    dwellSeconds: 0,
    dwellInterval: null,
    quantityPrompted: false,
    discountShown: false,
    typingTimer: null,
    typed: "",
    typingText: "",
    typingIndex: 0,
    drawerOpen: false,
    forSelf: null,
    useCase: null,
    hoveredSizes: [],
    chatHistory: [],
    ttsAudio: null,
    contextAsked: false
  };

  function logoUrl() {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("assets/gymshark.png");
    }
    return "./assets/gymshark.png";
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visibleText(el) {
    if (!el) return "";
    return cleanText(
      el.innerText ||
        el.textContent ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("alt") ||
        ""
    );
  }

  function blobFor(el) {
    if (!el) return "";
    const parts = [];
    let current = el;
    for (let i = 0; current && i < 4; i += 1) {
      parts.push(visibleText(current));
      parts.push(current.id || "");
      parts.push(String(current.className || ""));
      parts.push(current.getAttribute("aria-label") || "");
      parts.push(current.getAttribute("data-testid") || "");
      current = current.parentElement;
    }
    return parts.join(" ").toLowerCase();
  }

  function isSizeAreaElement(el) {
    return Boolean(el?.closest(".sizes, .size-guide, [data-size-selector], [data-size-guide]"));
  }

  function classifyElement(target) {
    const el = target instanceof HTMLElement ? target : target?.parentElement;
    if (!el) return "other";
    const subject =
      el.closest("button, a, label, select, option, input, [role='button'], [role='radio'], [role='option'], img") ||
      el;
    const text = visibleText(subject).toLowerCase();
    const normalized = text.replace(/[^a-z0-9]/g, "");
    const blob = blobFor(subject);

    if (subject.closest(".carousel-thumbs")) return "carousel_thumbnail";
    if (subject.tagName.toLowerCase() === "img" || subject.closest("[data-product-main-trigger]")) return "product_image";
    if (isSizeAreaElement(subject)) {
      if (subject.closest(".size-guide") || /size\s?(guide|chart)|what'?s my size/.test(blob)) return "size_guide";
      if (SIZE_WORDS.has(normalized) || /^(uk|us|eu)?\s?\d{1,2}(\.\d)?$/.test(text)) return "size_selector";
    }
    if (blob.includes("quantity") || blob.includes("qty")) return "quantity";
    if (blob.includes("delivery") || blob.includes("pincode") || blob.includes("postcode")) return "delivery";
    if (blob.includes("add to cart") || blob.includes("add to bag") || blob.includes("buy now")) return "add_to_cart";
    if (blob.includes("review") || blob.includes("rating")) return "reviews";
    if (/[₹$£€]\s?\d/.test(text) || blob.includes("price")) return "price";
    return "other";
  }

  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const box = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function extractProductContext() {
    const title = cleanText(document.querySelector("h1")?.textContent || document.title);
    const priceText = cleanText(document.querySelector("[data-product-price], .product-price, .price")?.textContent || "$44");
    const price = priceText.replace(/[^0-9.]/g, "");

    const sizes = [...document.querySelectorAll("button, label, [role='radio']")]
      .filter(isVisible)
      .map((el) => visibleText(el).toUpperCase())
      .filter((text) => SIZE_WORDS.has(text.toLowerCase()) || /^(UK|US|EU)?\s?\d{1,2}(\.\d)?$/.test(text));

    const ratingEl = document.querySelector(".rating");
    const ratingText = ratingEl ? cleanText(ratingEl.textContent) : "";
    const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    return {
      title,
      price: price ? `$${price}` : priceText,
      sizes: [...new Set(sizes)].slice(0, 12),
      domain: location.hostname.replace(/^www\./, "") || "demo store",
      colors: [],
      tags: ["Clothing", "Activewear"],
      category: "Activewear Top",
      mood: "Athletic",
      rating,
      reviewCount: 0
    };
  }

  function buildPrompts(product) {
    const { title, sizes, reviewCount, rating, colors } = product;
    const shortTitle = title.split(" ").slice(0, 4).join(" ");

    return {
      fit: reviewCount > 200
        ? `${rating}★ from ${reviewCount.toLocaleString()} reviews — want the size read?`
        : sizes.length
          ? `Sizes run ${sizes.slice(0, 3).join("–")}. Want help picking?`
          : "Want fit help for this?",
      tryon: colors.length > 1
        ? `Also in ${colors.slice(0, 2).join(" & ")}. Want to see it on you?`
        : "Want to see it on yourself?",
      quantity: `Add one more ${shortTitle} and get 5% off the second piece.`,
      delivery: "Want delivery timing for your pincode?",
      discount: `Looks like you love this. Take XYZ10 for 10% off at checkout.`,
      context: state.useCase
        ? `Saving for ${state.useCase}?`
        : "Is this for you or a gift?"
    };
  }

  const PROMPT_HINTS = {
    fit: "Press Space to open",
    tryon: "Press Space to try on",
    quantity: "Press Space to add one more",
    delivery: "Press Space to check",
    discount: "Press Space to add to bag",
    context: "Press Space to answer"
  };

  function getSignals() {
    return {
      dwellSeconds: state.dwellSeconds,
      hoveredSizes: state.hoveredSizes.slice(-4),
      useCase: state.useCase,
      forSelf: state.forSelf
    };
  }

  async function fetchChatReply(userMessage) {
    const product = state.product || extractProductContext();
    state.chatHistory.push({ role: "user", content: userMessage });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: state.chatHistory.slice(-8),
          productContext: product,
          signals: getSignals()
        })
      });
      const data = await response.json();
      if (!response.ok || !data.reply) throw new Error(data.error || "No reply");
      state.chatHistory.push({ role: "assistant", content: data.reply });
      return data.reply;
    } catch {
      const fallback = "I'm having trouble connecting right now. Try typing your question below.";
      state.chatHistory.push({ role: "assistant", content: fallback });
      return fallback;
    }
  }

  async function speakText(text) {
    try {
      state.ttsAudio?.pause();
      state.ttsAudio = null;
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 200), voice: "nova" })
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      state.ttsAudio = audio;
      audio.play();
    } catch {
      // TTS is best-effort
    }
  }

  function ensureRoot() {
    let root = document.getElementById(ASSISTANT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ASSISTANT_ID;
    root.innerHTML = `
      <button class="hfa-floater" type="button" aria-label="Open shopping assistant">
        <img src="${logoUrl()}" alt="" />
      </button>
      <div class="hfa-companion" aria-hidden="true">
        <img src="${logoUrl()}" alt="" />
      </div>
      <div class="hfa-typewriter" hidden>
        <img src="${logoUrl()}" alt="" />
        <div class="hfa-typewriter-copy">
          <p></p>
          <small></small>
        </div>
        <button class="hfa-close" type="button" aria-label="Dismiss">×</button>
      </div>
      <div class="hfa-cart-toast" hidden></div>
      <aside class="hfa-drawer" aria-label="Shopping assistant" hidden></aside>
    `;
    document.documentElement.appendChild(root);

    root.querySelector(".hfa-floater")?.addEventListener("click", () => {
      if (state.drawerOpen) closeDrawer();
      else openDrawer("fit");
    });
    root.querySelector(".hfa-typewriter")?.addEventListener("click", (event) => {
      if (event.target.closest(".hfa-close")) return;
      handlePromptAction();
    });
    root.querySelector(".hfa-close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      hidePrompt();
    });
    return root;
  }

  function setDrawerState(open) {
    state.drawerOpen = open;
    ensureRoot().dataset.drawerOpen = open ? "true" : "false";
  }

  function moveCompanion(elementType = "other") {
    const root = ensureRoot();
    const companion = root.querySelector(".hfa-companion");
    if (!companion) return;
    const x = Math.min(window.innerWidth - 58, Math.max(10, state.lastMouse.x + 4));
    const y = Math.min(window.innerHeight - 58, Math.max(10, state.lastMouse.y + 4));
    companion.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    companion.dataset.mood = elementType;
  }

  function placePrompt() {
    const box = ensureRoot().querySelector(".hfa-typewriter");
    if (!box) return;
    const width = state.lastPrompt === "discount" ? 380 : 280;
    const height = 54;
    let x = state.lastMouse.x + 14;
    let y = state.lastMouse.y + 14;
    if (x + width > window.innerWidth - 16) x = state.lastMouse.x - width - 14;
    if (y + height > window.innerHeight - 16) y = state.lastMouse.y - height - 14;
    box.style.left = `${Math.max(16, x)}px`;
    box.style.top = `${Math.max(16, y)}px`;
  }

  function showTypewriter(mode) {
    const product = state.product || extractProductContext();
    const prompts = buildPrompts(product);
    const promptText = prompts[mode] || prompts.fit;

    if (state.lastPrompt === mode && !ensureRoot().querySelector(".hfa-typewriter")?.hidden) return;
    state.lastPrompt = mode;
    state.panelMode = mode;
    state.typingText = promptText;
    state.typed = "";
    state.typingIndex = 0;

    const root = ensureRoot();
    const box = root.querySelector(".hfa-typewriter");
    const text = box.querySelector("p");
    const hint = box.querySelector("small");
    root.dataset.promptOpen = "true";
    box.hidden = false;
    box.dataset.mode = mode;
    placePrompt();
    text.textContent = "";
    hint.textContent = PROMPT_HINTS[mode] || PROMPT_HINTS.fit;
    clearInterval(state.typingTimer);
    state.typingTimer = setInterval(() => {
      state.typed += state.typingText[state.typingIndex] || "";
      text.textContent = state.typed;
      state.typingIndex += 1;
      if (state.typingIndex >= state.typingText.length) clearInterval(state.typingTimer);
    }, 24);
  }

  function hidePrompt() {
    const root = ensureRoot();
    const box = root.querySelector(".hfa-typewriter");
    if (box) box.hidden = true;
    root.dataset.promptOpen = "false";
    clearInterval(state.typingTimer);
    state.lastPrompt = null;
  }

  function countSizeSignal(source) {
    const now = Date.now();
    if (now - state.lastSizeSignalAt < 900) return;
    state.lastSizeSignalAt = now;
    state.sizeSignals += source === "size_guide" ? 2 : 1;
    if (
      state.sizeSignals >= 4 &&
      !state.drawerOpen &&
      (state.currentHoverType === "size_selector" || state.currentHoverType === "size_guide")
    ) {
      showTypewriter("fit");
    }
  }

  function isSizeIntent(type) {
    return type === "size_selector" || type === "size_guide";
  }

  function openDrawer(mode = "fit") {
    state.panelMode = mode;
    hidePrompt();
    const drawer = ensureRoot().querySelector(".hfa-drawer");
    const product = state.product || extractProductContext();
    drawer.hidden = false;
    drawer.dataset.mode = mode;

    if (mode === "context") {
      drawer.innerHTML = contextMarkup();
    } else if (mode === "tryon") {
      drawer.innerHTML = tryOnMarkup(product);
    } else {
      drawer.innerHTML = fitMarkup(product);
    }

    setDrawerState(true);
    bindDrawer(drawer, mode);
  }

  function closeDrawer() {
    const drawer = ensureRoot().querySelector(".hfa-drawer");
    if (drawer) drawer.hidden = true;
    setDrawerState(false);
  }

  function fitMarkup(product) {
    const sizeNote = product.sizes.length
      ? `<p>Sizes available: <strong>${product.sizes.join(", ")}</strong>.</p>`
      : "";
    return `
      <header class="hfa-drawer-header">
        <div>
          <span>Fit help</span>
          <strong>${escapeHtml(product.title || "This product")}</strong>
        </div>
        <button class="hfa-drawer-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="hfa-guidance">
        ${sizeNote}
        <p>Tell me your height, weight, usual size, and fit preference — I'll suggest the right size.</p>
      </div>
      <div class="hfa-chat" aria-live="polite">
        <div class="hfa-message hfa-ai">What's your usual size and how do you like things to fit?</div>
      </div>
      <form class="hfa-chat-form">
        <input name="message" placeholder="e.g. 5'6, 58 kg, usually S, snug fit" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;
  }

  function tryOnMarkup(product) {
    return `
      <header class="hfa-drawer-header">
        <div>
          <span>Virtual try-on</span>
          <strong>${escapeHtml(product.title || "This product")}</strong>
        </div>
        <button class="hfa-drawer-close" type="button" aria-label="Close">×</button>
      </header>
      <label class="hfa-upload">
        <input type="file" accept="image/*" />
        <span>Upload your photo</span>
        <small>Prototype preview only. Image stays local in this demo.</small>
      </label>
      <div class="hfa-preview">
        <span>Your preview appears here.</span>
      </div>
      <div class="hfa-chat" aria-live="polite">
        <div class="hfa-message hfa-ai">Upload a straight-on photo and ask about the color, neckline, or fit.</div>
      </div>
      <form class="hfa-chat-form">
        <input name="message" placeholder="Ask about color, style, or fit" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;
  }

  function contextMarkup() {
    return `
      <header class="hfa-drawer-header">
        <div>
          <span>Quick question</span>
          <strong>Help me help you</strong>
        </div>
        <button class="hfa-drawer-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="hfa-guidance">
        <p>Two quick answers let me give you much better suggestions.</p>
      </div>
      <div class="hfa-context-options">
        <p class="hfa-context-q">Is this for you or a gift?</p>
        <div class="hfa-context-btns">
          <button type="button" data-answer="self">For me</button>
          <button type="button" data-answer="gift">Gift</button>
        </div>
        <p class="hfa-context-q">How will you use it?</p>
        <div class="hfa-context-btns">
          <button type="button" data-usecase="training">Training</button>
          <button type="button" data-usecase="casual">Casual</button>
          <button type="button" data-usecase="both">Both</button>
        </div>
      </div>
      <div class="hfa-chat" aria-live="polite"></div>
      <form class="hfa-chat-form">
        <input name="message" placeholder="Or just ask anything..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;
  }

  function bindDrawer(drawer, mode) {
    drawer.querySelector(".hfa-drawer-close")?.addEventListener("click", closeDrawer);

    drawer.querySelectorAll("[data-answer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.forSelf = btn.dataset.answer === "self";
        drawer.querySelectorAll("[data-answer]").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
    });

    drawer.querySelectorAll("[data-usecase]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.useCase = btn.dataset.usecase;
        drawer.querySelectorAll("[data-usecase]").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        const chat = drawer.querySelector(".hfa-chat");
        if (chat) {
          const msg = state.forSelf === false
            ? `Got it — a gift for ${state.useCase} use. I'll keep that in mind.`
            : `Got it — ${state.useCase} use. The snug fit works well for training; size up for casual layering.`;
          addChatMessage(drawer, msg, "ai");
          speakText(msg);
        }
      });
    });

    drawer.querySelector(".hfa-chat-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.message;
      const text = cleanText(input.value);
      if (!text) return;
      input.value = "";
      addChatMessage(drawer, text, "user");
      const thinkingEl = addChatMessage(drawer, "…", "ai");
      const reply = await fetchChatReply(text);
      if (thinkingEl) thinkingEl.textContent = reply;
      speakText(reply);
    });

    const upload = drawer.querySelector("input[type='file']");
    upload?.addEventListener("change", () => {
      const file = upload.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const preview = drawer.querySelector(".hfa-preview");
        preview.innerHTML = `<img src="${reader.result}" alt="Uploaded photo preview" />`;
        const msg = "Photo loaded. A real try-on model would overlay the garment here.";
        addChatMessage(drawer, msg, "ai");
        speakText(msg);
      };
      reader.readAsDataURL(file);
    });
  }

  function addChatMessage(drawer, text, role) {
    const chat = drawer.querySelector(".hfa-chat");
    if (!chat) return null;
    const message = document.createElement("div");
    message.className = `hfa-message hfa-${role}`;
    message.textContent = text;
    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
    return message;
  }

  function bindListeners() {
    document.querySelectorAll("[data-product-main-trigger], [data-product-main-trigger] img").forEach((element) => {
      element.addEventListener("click", () => {
        if (!state.drawerOpen) showTypewriter("tryon");
      });
      element.addEventListener("mouseenter", () => {
        clearTimeout(state.imageHoverTimer);
        state.imageHoverTimer = setTimeout(() => {
          if (!state.drawerOpen && state.currentHoverType === "product_image") showTypewriter("tryon");
        }, 1400);
      });
      element.addEventListener("mouseleave", () => clearTimeout(state.imageHoverTimer));
    });

    document.addEventListener(
      "mousemove",
      (event) => {
        state.lastMouse = { x: event.clientX, y: event.clientY };
        if (event.target instanceof Element && event.target.closest(`#${ASSISTANT_ID}`)) return;
        const type = classifyElement(event.target);
        const previousType = state.currentHoverType;
        state.currentHoverType = type;
        moveCompanion(type);
        clearTimeout(state.sizeHoverTimer);
        if (state.lastPrompt === "fit" && !isSizeIntent(type)) hidePrompt();
        if (type !== "product_image") clearTimeout(state.imageHoverTimer);
        if (isSizeIntent(type) && previousType !== type) {
          state.sizeHoverTimer = setTimeout(() => {
            const sizeText = visibleText(event.target).toUpperCase();
            if (SIZE_WORDS.has(sizeText.toLowerCase()) && !state.hoveredSizes.includes(sizeText)) {
              state.hoveredSizes.push(sizeText);
            }
            countSizeSignal(type);
          }, 900);
        }
        if (type === "product_image" && previousType !== "product_image") {
          clearTimeout(state.imageHoverTimer);
          state.imageHoverTimer = setTimeout(() => {
            if (!state.drawerOpen && state.currentHoverType === "product_image") showTypewriter("tryon");
          }, 1400);
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (event.target instanceof Element && event.target.closest(`#${ASSISTANT_ID}`)) return;
        const type = classifyElement(event.target);
        if (isSizeIntent(type)) {
          state.currentHoverType = type;
          countSizeSignal(type);
        }
        if (type === "product_image" && !state.drawerOpen) showTypewriter("tryon");
        if (type === "delivery" && !state.drawerOpen) showTypewriter("delivery");
      },
      true
    );

    document.addEventListener("quantitychange", (event) => {
      if (Number(event.detail?.quantity || 1) >= 2 && !state.quantityPrompted && !state.drawerOpen) {
        state.quantityPrompted = true;
        showTypewriter("quantity");
      }
    });

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key.toLowerCase() === "x" || event.key === "Escape") {
        hidePrompt();
        if (state.drawerOpen) closeDrawer();
        return;
      }
      if (event.code === "Space" && state.lastPrompt) {
        event.preventDefault();
        handlePromptAction();
      }
    });
  }

  function handlePromptAction() {
    if (state.lastPrompt === "discount") { addToBagWithDiscount(); return; }
    if (state.lastPrompt === "quantity") {
      incrementQuantity();
      hidePrompt();
      showCartToast("Second piece added. Extra 5% applies to the second item.");
      return;
    }
    if (state.lastPrompt === "delivery") { openDeliveryPanel(); return; }
    if (state.lastPrompt === "context") { openDrawer("context"); return; }
    if (state.lastPrompt === "tryon") { openDrawer("tryon"); return; }
    if (state.lastPrompt === "fit") { openDrawer("fit"); }
  }

  function addToBagWithDiscount() {
    const addButton = [...document.querySelectorAll("button")].find((button) =>
      /add to (bag|cart)/i.test(visibleText(button))
    );
    addButton?.click();
    if (addButton) {
      addButton.textContent = "Added to bag - XYZ10 ready";
      addButton.classList.add("is-added");
    }
    hidePrompt();
    showCartToast("Added to bag. Use XYZ10 at checkout for 10% off.");
  }

  function incrementQuantity() {
    document.querySelector("[data-quantity-plus]")?.click();
  }

  function openDeliveryPanel() {
    hidePrompt();
    document.querySelector(".delivery-check input")?.focus();
  }

  function showCartToast(message) {
    const toast = ensureRoot().querySelector(".hfa-cart-toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function scheduleDwellPrompt() {
    state.dwellInterval = setInterval(() => { state.dwellSeconds += 1; }, 1000);

    setTimeout(() => {
      if (!state.drawerOpen && !state.contextAsked && state.forSelf === null) {
        state.contextAsked = true;
        showTypewriter("context");
      }
    }, 8000);

    setTimeout(() => {
      if (!state.discountShown && !state.drawerOpen) {
        state.discountShown = true;
        hidePrompt();
        showTypewriter("discount");
      }
    }, 30000);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])
    );
  }

  function init() {
    state.product = extractProductContext();
    ensureRoot();
    setDrawerState(false);
    moveCompanion();
    bindListeners();
    scheduleDwellPrompt();
  }

  init();
})();
