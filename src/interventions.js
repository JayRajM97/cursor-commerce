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

const state = {
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.addEventListener("mousemove", (event) => {
  state.mouse.x = event.clientX;
  state.mouse.y = event.clientY;
  updateEyeTarget();
});

mascot.addEventListener("click", () => {
  if (state.mode === "idle") setMode("following");
  else setMode("idle");
});

// Spacebar visually puts mascot in voice mode while marketplace.js handles real recording
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || isTyping(event.target)) return;
  if (event.repeat) return;
  if (state.mode !== "voice") setMode("voice");
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
      if (state.mode !== "voice") setMode("voice");
    } else if (state.mode === "voice") {
      // marketplace stopped — drop mascot back to idle (or following if previously)
      setMode("idle");
      const idx = Math.floor(Math.random() * SUGGESTIONS.length);
      showBubble(idx);
    }
  });
  observer.observe(btn, { attributes: true, attributeFilter: ["class"] });
}
watchConciergeVoice();

function step() {
  let target = { x: state.dock.x, y: state.dock.y };
  if (state.mode === "following") {
    target = {
      x: state.mouse.x + FOLLOW_OFFSET_X,
      y: state.mouse.y + FOLLOW_OFFSET_Y
    };
  }
  state.vel.x = (state.vel.x + (target.x - state.pos.x) * SPRING_K) * SPRING_D;
  state.vel.y = (state.vel.y + (target.y - state.pos.y) * SPRING_K) * SPRING_D;
  state.pos.x += state.vel.x;
  state.pos.y += state.vel.y;
  mascot.style.transform = `translate3d(${state.pos.x}px, ${state.pos.y}px, 0)`;
  for (const pupil of pupils) {
    pupil.style.left = `${3 + state.eye.x * 0.4}px`;
    pupil.style.top = `${3 + state.eye.y * 0.4}px`;
  }
  if (state.mode === "idle") {
    tooltip.style.transform = `translate3d(${state.pos.x + 70}px, ${state.pos.y + 14}px, 0)`;
  }
  requestAnimationFrame(step);
}

function setMode(mode) {
  state.mode = mode;
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
    clearTimeout(state.bubbleTimer);
    state.bubbleTimer = setTimeout(() => showBubble(2), 2400);
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
  state.voiceTimerInterval = setInterval(() => {
    const level = 0.3 + Math.random() * 0.7;
    waveBars.forEach((bar, i) => {
      const center = i === 2 ? 1 : i === 1 || i === 3 ? 0.7 : 0.4;
      bar.style.height = `${6 + level * 18 * center}px`;
    });
  }, 90);
}

function stopVoiceMeter() {
  clearInterval(state.voiceTimerInterval);
  state.voiceTimerInterval = null;
  waveBars.forEach((bar) => (bar.style.height = "8px"));
}

function startBlinkLoop() {
  const tick = () => {
    mascot.dataset.blink = "true";
    setTimeout(() => (mascot.dataset.blink = "false"), 140);
    state.blinkTimer = setTimeout(tick, 2800 + Math.random() * 2400);
  };
  state.blinkTimer = setTimeout(tick, 1800);
}

function startTooltipDelay() {
  hideTooltip();
  clearTimeout(state.tooltipTimer);
  state.tooltipTimer = setTimeout(() => {
    if (state.mode === "idle") tooltip.dataset.show = "true";
  }, 2200);
}

function hideTooltip() {
  tooltip.dataset.show = "false";
}

function updateEyeTarget() {
  const cx = state.pos.x + 28;
  const cy = state.pos.y + 28;
  const dx = state.mouse.x - cx;
  const dy = state.mouse.y - cy;
  const dist = Math.max(Math.hypot(dx, dy), 1);
  state.eye.x = (dx / dist) * 4;
  state.eye.y = (dy / dist) * 4;
}

function positionDock() {
  state.dock = { x: 32, y: Math.min(window.innerHeight - 140, 240) };
  if (state.mode === "idle") {
    state.pos = { ...state.dock };
    mascot.style.transform = `translate3d(${state.pos.x}px, ${state.pos.y}px, 0)`;
  }
}

function showBubble(index) {
  const s = SUGGESTIONS[index];
  bubbleEmoji.textContent = s.emoji;
  bubbleText.textContent = s.text;
  bubbleCta.textContent = s.cta;
  bubble.hidden = false;
  const x = Math.min(window.innerWidth - 300, state.pos.x + 80);
  const y = Math.max(20, state.pos.y - 20);
  bubble.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  clearTimeout(state.bubbleHideTimer);
  state.bubbleHideTimer = setTimeout(hideBubble, 6500);
}

function hideBubble() {
  bubble.hidden = true;
  clearTimeout(state.bubbleHideTimer);
}

function isTyping(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
}
