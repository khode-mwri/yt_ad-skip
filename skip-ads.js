(() => {
  const SKIP_SEL = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-skip-ad-button",
    "button.ytp-ad-skip-button-modern",
    ".videoAdUiSkipButton",
    'button[id^="skip-button"]',
    'button[aria-label^="Skip ad"]',
    'button[aria-label^="Skip ads"]'
  ].join(",");

  let lastAct = 0;
  let lastPlay = 0;

  function player() {
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  }
  function videoEl() {
    const p = player();
    return (p && p.querySelector("video")) || document.querySelector("video.html5-main-video");
  }
  function adOn() {
    const p = player();
    return !!(p && (p.classList.contains("ad-showing") || p.classList.contains("ad-interrupting")));
  }
  function txt(el) {
    return ((el && (el.innerText || el.textContent)) || "") + " " + ((el && el.getAttribute("aria-label")) || "");
  }
  function isPremium(el) {
    const t = txt(el).toLowerCase();
    if (/premium|subscribe|trial|upgrade|youtube tv|پریمیوم|اشتراک/.test(t)) return true;
    return !!(el && el.closest && el.closest("ytd-mealbar-promo-renderer, yt-mealbar-promo-renderer, .ytp-premium-overlay"));
  }
  function isCountdown(el) {
    return /skip(?:\s*ads?)?\s*in\s*\d|در\s*\d|\d+\s*(?:sec|s\b|ثانیه)/i.test(txt(el));
  }
  function resolveBtn(el) {
    if (!el) return null;
    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") return el;
    return el.closest("button,[role='button']") || el.querySelector("button") || el;
  }
  function isReady(el) {
    const btn = resolveBtn(el);
    if (!btn || isPremium(btn) || isCountdown(btn)) return false;
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
    return true;
  }
  function clickBtn(el) {
    const btn = resolveBtn(el);
    if (!btn) return;
    try {
      btn.disabled = false;
      btn.removeAttribute("disabled");
      btn.removeAttribute("aria-disabled");
    } catch (_) {}
    const r = btn.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: r.left + Math.max(4, r.width / 2),
      clientY: r.top + Math.max(4, r.height / 2),
      buttons: 1
    };
    ["pointerover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      try { btn.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse" })); }
      catch (_) { try { btn.dispatchEvent(new MouseEvent(type, opts)); } catch (__) {} }
    });
    try { btn.click(); } catch (_) {}
  }
  function seekEnd(v) {
    if (!v || !v.duration || !isFinite(v.duration)) return false;
    try {
      if (v.duration - v.currentTime > 0.12) {
        v.currentTime = Math.max(0, v.duration - 0.04);
        return true;
      }
    } catch (_) {}
    return false;
  }
  function playIfNeeded() {
    if (adOn()) return;
    const now = Date.now();
    if (now - lastPlay < 600) return;
    const p = player();
    const v = videoEl();
    if (!p) return;
    const stuck = p.classList.contains("paused-mode") || p.classList.contains("unstarted-mode") || (v && v.paused);
    if (!stuck) return;
    lastPlay = now;
    if (v && v.paused) {
      const pr = v.play();
      if (pr && pr.catch) pr.catch(() => {});
    }
    const btn = p.querySelector(".ytp-large-play-button, .ytp-play-button");
    if (btn) clickBtn(btn);
  }
  function readySkips() {
    const root = player() || document;
    const out = [];
    try {
      root.querySelectorAll(SKIP_SEL).forEach((n) => {
        const b = resolveBtn(n);
        if (isReady(b)) out.push(b);
      });
    } catch (_) {}
    return out;
  }
  function tick() {
    const v = videoEl();
    if (!adOn()) {
      playIfNeeded();
      return;
    }
    const ready = readySkips();
    const now = Date.now();
    if (ready.length && now - lastAct > 280) {
      clickBtn(ready[0]);
      seekEnd(v);
      lastAct = now;
      return;
    }
    if (v && v.currentTime >= 4.9 && now - lastAct > 400) {
      seekEnd(v);
      lastAct = now;
    }
  }
  setInterval(tick, 180);
  const mo = new MutationObserver(tick);
  const start = () => {
    const p = player() || document.documentElement;
    try { mo.observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-disabled", "disabled"] }); } catch (_) {}
  };
  start();
  document.addEventListener("yt-navigate-finish", () => setTimeout(start, 200));
})();
