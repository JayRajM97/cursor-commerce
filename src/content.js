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
    dwellTimer: null,
    quantityPrompted: false,
    discountShown: false,
    typingTimer: null,
    typed: "",
    typingText: "",
    typingIndex: 0,
    drawerOpen: false
  };

  const prompts = {
    fit: "Need fit help?",
    tryon: "Want to see it on yourself?",
    quantity: "Add one more and get 5% off the second piece.",
    delivery: "Want delivery timing for your pincode?",
    discount: "Looks like you love this product. Take XYZ10 for 10% off at checkout."
  };

  const promptHints = {
    fit: "Press Space to open",
    tryon: "Press Space to try on",
    quantity: "Press Space to add one more",
    delivery: "Press Space to check",
    discount: "Press Space to add to bag"
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function logoUrl() {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("assets/gymshark.png");
    }
    return "./assets/gymshark.png";
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
    const price = cleanText(document.querySelector("[data-product-price], .product-price, .price")?.textContent || "$64");
    const sizes = [...document.querySelectorAll("button, label, [role='radio']")]
      .filter(isVisible)
      .map((el) => visibleText(el).toUpperCase())
      .filter((text) => SIZE_WORDS.has(text.toLowerCase()) || /^(UK|US|EU)?\s?\d{1,2}(\.\d)?$/.test(text));

    return {
      title,
      price,
      sizes: [...new Set(sizes)].slice(0, 12),
      domain: location.hostname.replace(/^www\./, "") || "demo store"
    };
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
      if (state.drawerOpen) {
        closeDrawer();
      } else {
        openDrawer("fit");
      }
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

    const x = Math.min(window.innerWidth - 58, Math.max(10, state.lastMouse.x + 10));
    const y = Math.min(window.innerHeight - 58, Math.max(10, state.lastMouse.y + 10));
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
    if (state.lastPrompt === mode && !ensureRoot().querySelector(".hfa-typewriter")?.hidden) return;
    state.lastPrompt = mode;
    state.panelMode = mode;
    state.typingText = prompts[mode];
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
    hint.textContent = promptHints[mode] || promptHints.fit;
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
    drawer.innerHTML = mode === "tryon" ? tryOnMarkup(product) : fitMarkup(product);
    setDrawerState(true);
    bindDrawer(drawer, mode);
  }

  function closeDrawer() {
    const drawer = ensureRoot().querySelector(".hfa-drawer");
    if (drawer) drawer.hidden = true;
    setDrawerState(false);
  }

  function fitMarkup(product) {
    return `
      <header class="hfa-drawer-header">
        <div>
          <span>Fit help</span>
          <strong>${escapeHtml(product.title || "This product")}</strong>
        </div>
        <button class="hfa-drawer-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="hfa-guidance">
        <p>For this style, start with your usual top size. Size up if you want more room through the chest or shoulders.</p>
        <ul>
          <li>Sweetheart necklines usually feel more fitted.</li>
          <li>Long sleeves can feel tighter if you are between sizes.</li>
          <li>Pick the larger size for training comfort.</li>
        </ul>
      </div>
      <div class="hfa-chat" aria-live="polite">
        <div class="hfa-message hfa-ai">Tell me your height, weight, usual size, and fit preference. I will suggest a size.</div>
      </div>
      <form class="hfa-chat-form">
        <input name="message" placeholder="Example: 5'6, 58 kg, usually S, snug fit" autocomplete="off" />
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
        <small>Prototype preview only. The image stays local in this demo.</small>
      </label>
      <div class="hfa-preview">
        <span>Your preview appears here.</span>
      </div>
      <div class="hfa-chat" aria-live="polite">
        <div class="hfa-message hfa-ai">Upload a straight-on photo, then ask if the color, neckline, or sleeve length works for you.</div>
      </div>
      <form class="hfa-chat-form">
        <input name="message" placeholder="Ask about color, style, or fit" autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;
  }

  function bindDrawer(drawer, mode) {
    drawer.querySelector(".hfa-drawer-close")?.addEventListener("click", closeDrawer);
    drawer.querySelector(".hfa-chat-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.message;
      const text = cleanText(input.value);
      if (!text) return;
      input.value = "";
      addChatMessage(drawer, text, "user");
      const reply = mode === "tryon" ? makeTryOnReply(text) : makeFitReply(text);
      setTimeout(() => addChatMessage(drawer, reply, "ai"), 180);
    });

    const upload = drawer.querySelector("input[type='file']");
    upload?.addEventListener("change", () => {
      const file = upload.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const preview = drawer.querySelector(".hfa-preview");
        preview.innerHTML = `<img src="${reader.result}" alt="Uploaded photo preview" />`;
        addChatMessage(drawer, "Photo loaded locally. A real try-on model would generate the outfit preview from here.", "ai");
      };
      reader.readAsDataURL(file);
    });
  }

  function addChatMessage(drawer, text, role) {
    const chat = drawer.querySelector(".hfa-chat");
    const message = document.createElement("div");
    message.className = `hfa-message hfa-${role}`;
    message.textContent = text;
    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
  }

  function makeFitReply(text) {
    const lower = text.toLowerCase();
    const usual = lower.match(/\b(xxs|xs|s|m|l|xl|xxl|2xl|3xl)\b/)?.[1]?.toUpperCase() || "M";
    const wantsRoom = /relaxed|loose|oversized|room|comfort/.test(lower);
    const wantsSnug = /snug|tight|slim|fitted/.test(lower);
    const size = wantsRoom ? nextSize(usual) : wantsSnug ? usual : usual;
    const backup = wantsRoom ? usual : nextSize(usual);
    return `${size} looks like the best starting size. Go ${backup} if you are between sizes or want more room through the chest and sleeves.`;
  }

  function makeTryOnReply(text) {
    const lower = text.toLowerCase();
    if (/color|pink|shade/.test(lower)) return "The pink reads soft and sporty. I would compare it against your usual workout colors and check it in natural light.";
    if (/sleeve|neck|crop/.test(lower)) return "The long sleeve and sweetheart neckline are the key checks here. A try-on preview should focus on shoulder pull, sleeve length, and crop height.";
    return "For a strong try-on result, use a front-facing photo with good light. I would preview the top and call out neckline, sleeve length, and overall silhouette.";
  }

  function nextSize(size) {
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
    const index = Math.max(0, order.indexOf(size));
    return order[Math.min(order.length - 1, index + 1)];
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
        if (state.lastPrompt === "fit" && !isSizeIntent(type)) {
          hidePrompt();
        }
        if (type !== "product_image") clearTimeout(state.imageHoverTimer);
        if (isSizeIntent(type) && previousType !== type) {
          state.sizeHoverTimer = setTimeout(() => countSizeSignal(type), 900);
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
    if (state.lastPrompt === "discount") {
      addToBagWithDiscount();
      return;
    }
    if (state.lastPrompt === "quantity") {
      incrementQuantity();
      hidePrompt();
      showCartToast("Second piece added. Extra 5% applies to the second item.");
      return;
    }
    if (state.lastPrompt === "delivery") {
      openDeliveryPanel();
      return;
    }
    if (state.lastPrompt === "tryon") {
      openDrawer("tryon");
      return;
    }
    if (state.lastPrompt === "fit") {
      openDrawer("fit");
    }
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
    const plus = document.querySelector("[data-quantity-plus]");
    plus?.click();
  }

  function openDeliveryPanel() {
    hidePrompt();
    const deliveryInput = document.querySelector(".delivery-check input");
    deliveryInput?.focus();
  }

  function showCartToast(message) {
    const toast = ensureRoot().querySelector(".hfa-cart-toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function scheduleDwellPrompt() {
    clearTimeout(state.dwellTimer);
    state.dwellTimer = setTimeout(() => {
      if (!state.discountShown && !state.drawerOpen) {
        state.discountShown = true;
        hidePrompt();
        showTypewriter("discount");
      }
    }, 30000);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
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
