(function () {
  const SPRING_K = 0.12;
  const SPRING_D = 0.78;
  const FOLLOW_OFFSET_X = 24;
  const FOLLOW_OFFSET_Y = -28;

  const SUGGESTIONS = [
    { emoji: "📏", text: "Reviews say true to size — most people order their usual.", cta: "View size guide" },
    { emoji: "📉", text: "Price held steady the last 30 days — no recent drop.", cta: "Track price" },
    { emoji: "⭐", text: "94% of buyers say true to size and breathable.", cta: "Read reviews" },
    { emoji: "🎁", text: "Free returns for 30 days — low-risk to try a size.", cta: "Add to cart" },
    { emoji: "🪞", text: "Want me to compare two similar tees side-by-side?", cta: "Compare" }
  ];

  const ivState = {
    mode: "idle",
    mouse: { x: 200, y: 280 },
    pos: { x: 40, y: 240 },
    vel: { x: 0, y: 0 },
    dock: { x: 40, y: 240 },
    eye: { x: 0, y: 0 },
    voiceTimerInterval: null,
    voiceAutoStop: null,
    bubbleTimer: null,
    bubbleHideTimer: null,
    tooltipTimer: null,
    blinkTimer: null
  };

  const root = document.body;
  const mascot = document.getElementById("mascot");
  const mascotLabel = document.getElementById("mascotLabel");
  const tooltip = document.getElementById("tooltip");
  const bubble = document.getElementById("bubble");
  const bubbleEmoji = document.getElementById("bubbleEmoji");
  const bubbleText = document.getElementById("bubbleText");
  const bubbleCta = document.getElementById("bubbleCta");
  const bubbleClose = document.getElementById("bubbleClose");
  const modeIndicator = document.getElementById("modeIndicator");
  const modeLabel = modeIndicator.querySelector(".iv-mode-label");
  const waveBars = mascot.querySelectorAll(".iv-wave span");
  const pupils = mascot.querySelectorAll(".iv-pupil");

  setMode("idle");
  positionDock();
  window.addEventListener("resize", positionDock);

  // Tab switching
  document.querySelectorAll(".iv-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".iv-tab").forEach((t) => {
        const active = t.dataset.tab === target;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      document.querySelectorAll("[data-panel]").forEach((p) => {
        p.hidden = p.dataset.panel !== target;
      });
      window.scrollTo({ top: 0, behavior: "auto" });
      setMode("idle");
      ivState.vel = { x: 0, y: 0 };
      requestAnimationFrame(() => {
        positionDock();
      });
    });
  });

  document.addEventListener("mousemove", (event) => {
    ivState.mouse.x = event.clientX;
    ivState.mouse.y = event.clientY;
    updateEyeTarget();
  });

  mascot.addEventListener("click", () => {
    if (ivState.mode === "idle") setMode("following");
    else setMode("idle");
  });

  // Spacebar visually puts mascot in voice mode while marketplace.js handles real recording
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || isTyping(event.target)) return;
    if (event.repeat) return;
    if (ivState.mode !== "voice") setMode("voice");
  });

  bubbleClose.addEventListener("click", hideBubble);
  bubbleCta.addEventListener("click", hideBubble);

  startBlinkLoop();
  startTooltipDelay();
  requestAnimationFrame(step);

  // Watch the marketplace voice button to keep the mascot in sync with the real recording
  function watchConciergeVoice() {
    const btn = document.querySelector("#conciergeVoice");
    if (!btn) return setTimeout(watchConciergeVoice, 200);
    const observer = new MutationObserver(() => {
      const listening = btn.classList.contains("is-listening");
      const live = btn.classList.contains("is-live");
      if (listening || live) {
        if (ivState.mode !== "voice") setMode("voice");
      } else if (ivState.mode === "voice") {
        setMode("idle");
        const idx = Math.floor(Math.random() * SUGGESTIONS.length);
        showBubble(idx);
      }
    });
    observer.observe(btn, { attributes: true, attributeFilter: ["class"] });
  }
  watchConciergeVoice();

  function step() {
    let target = { x: ivState.dock.x, y: ivState.dock.y };
    if (ivState.mode === "following") {
      target = {
        x: ivState.mouse.x + FOLLOW_OFFSET_X,
        y: ivState.mouse.y + FOLLOW_OFFSET_Y
      };
    }
    ivState.vel.x = (ivState.vel.x + (target.x - ivState.pos.x) * SPRING_K) * SPRING_D;
    ivState.vel.y = (ivState.vel.y + (target.y - ivState.pos.y) * SPRING_K) * SPRING_D;
    ivState.pos.x += ivState.vel.x;
    ivState.pos.y += ivState.vel.y;
    mascot.style.transform = `translate3d(${ivState.pos.x}px, ${ivState.pos.y}px, 0)`;
    for (const pupil of pupils) {
      pupil.style.left = `${3 + ivState.eye.x * 0.4}px`;
      pupil.style.top = `${3 + ivState.eye.y * 0.4}px`;
    }
    if (ivState.mode === "idle") {
      tooltip.style.transform = `translate3d(${ivState.pos.x + 70}px, ${ivState.pos.y + 14}px, 0)`;
    }
    requestAnimationFrame(step);
  }

  function setMode(mode) {
    ivState.mode = mode;
    root.dataset.mode = mode;
    mascot.dataset.mode = mode;
    if (mode === "idle") {
      mascotLabel.textContent = "";
      modeLabel.textContent = "Docked";
      stopVoiceMeter();
      startTooltipDelay();
    }
    if (mode === "following") {
      mascotLabel.textContent = "Following";
      modeLabel.textContent = "Active";
      hideTooltip();
      clearTimeout(ivState.bubbleTimer);
      ivState.bubbleTimer = setTimeout(() => showBubble(2), 2400);
    }
    if (mode === "voice") {
      mascotLabel.textContent = "Listening…";
      modeLabel.textContent = "Listening";
      hideTooltip();
      hideBubble();
      startVoiceMeter();
    }
  }

  function startVoiceMeter() {
    stopVoiceMeter();
    ivState.voiceTimerInterval = setInterval(() => {
      const level = 0.3 + Math.random() * 0.7;
      waveBars.forEach((bar, i) => {
        const center = i === 2 ? 1 : i === 1 || i === 3 ? 0.7 : 0.4;
        bar.style.height = `${6 + level * 18 * center}px`;
      });
    }, 90);
  }

  function stopVoiceMeter() {
    clearInterval(ivState.voiceTimerInterval);
    ivState.voiceTimerInterval = null;
    waveBars.forEach((bar) => (bar.style.height = "8px"));
  }

  function startBlinkLoop() {
    const tick = () => {
      mascot.dataset.blink = "true";
      setTimeout(() => (mascot.dataset.blink = "false"), 140);
      ivState.blinkTimer = setTimeout(tick, 2800 + Math.random() * 2400);
    };
    ivState.blinkTimer = setTimeout(tick, 1800);
  }

  function startTooltipDelay() {
    hideTooltip();
    clearTimeout(ivState.tooltipTimer);
    ivState.tooltipTimer = setTimeout(() => {
      if (ivState.mode === "idle") tooltip.dataset.show = "true";
    }, 2200);
  }

  function hideTooltip() {
    tooltip.dataset.show = "false";
  }

  function updateEyeTarget() {
    const cx = ivState.pos.x + 28;
    const cy = ivState.pos.y + 28;
    const dx = ivState.mouse.x - cx;
    const dy = ivState.mouse.y - cy;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    ivState.eye.x = (dx / dist) * 4;
    ivState.eye.y = (dy / dist) * 4;
  }

  function positionDock() {
    ivState.dock = { x: 32, y: Math.min(window.innerHeight - 140, 240) };
    if (ivState.mode === "idle") {
      ivState.pos = { ...ivState.dock };
      mascot.style.transform = `translate3d(${ivState.pos.x}px, ${ivState.pos.y}px, 0)`;
    }
  }

  function showBubble(index) {
    const s = SUGGESTIONS[index];
    bubbleEmoji.textContent = s.emoji;
    bubbleText.textContent = s.text;
    bubbleCta.textContent = s.cta;
    bubble.hidden = false;
    const x = Math.min(window.innerWidth - 300, ivState.pos.x + 80);
    const y = Math.max(20, ivState.pos.y - 20);
    bubble.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    clearTimeout(ivState.bubbleHideTimer);
    ivState.bubbleHideTimer = setTimeout(hideBubble, 6500);
  }

  function hideBubble() {
    bubble.hidden = true;
    clearTimeout(ivState.bubbleHideTimer);
  }

  function isTyping(target) {
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
  }
})();
