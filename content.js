(() => {
  "use strict";

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-skip-ad-button__text",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-skip-ad-button",
    "button.ytp-ad-skip-button-modern",
    '[class*="ytp-skip-ad-button"]',
    '[class*="ytp-ad-skip-button"]',
    '[id^="skip-button"]',
    ".ytp-ad-hover-text-button",
    ".videoAdUiSkipButton",
    ".videoAdUiSkipContainer"
  ].join(",");

  const OVERLAY_AD_SELECTORS = [
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container"
  ].join(",");

  const CAPTION_SELECTORS = [
    ".ytp-caption-segment",
    ".caption-window .ytp-caption-segment",
    ".ytp-caption-window-container .ytp-caption-segment"
  ].join(",");

  const DEFAULTS = {
    skipAds: true,
    muteAds: true,
    speedAds: true,
    adSpeed: 16,
    translateSubs: true,
    showOriginal: false,
    dubVoice: false,
    fontSize: 22
  };

  let settings = { ...DEFAULTS };
  let adActive = false;
  let userRate = 1;
  let userMuted = false;
  let userVolume = 1;
  let lastSkipAt = 0;
  let lastSpoken = "";
  let lastCaptionKey = "";
  const cache = new Map();
  let overlayEl = null;
  let observer = null;
  let boundVideo = null;

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    applyOverlayStyle();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) {
      if (k in settings || k in DEFAULTS) settings[k] = v.newValue;
    }
    applyOverlayStyle();
    if (!settings.translateSubs) hideOverlay();
    if (!settings.dubVoice) window.speechSynthesis?.cancel();
  });

  function getPlayer() {
    return (
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player")
    );
  }

  function getVideo() {
    const player = getPlayer();
    if (player) {
      const v = player.querySelector("video");
      if (v) return v;
    }
    return document.querySelector("video.html5-main-video");
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const opacity = Number(style.opacity);
    if (!Number.isNaN(opacity) && opacity === 0) return false;
    return r.width > 1 && r.height > 1;
  }

  function looksLikeSkip(el) {
    if (!el) return false;
    const text = ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
    return /skip|رد|عبور|пропуст|saltar|überspring|passer|スキップ|건너뛰/.test(text);
  }

  function isAdPlaying() {
    const player = getPlayer();
    if (!player) return false;
    return (
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting")
    );
  }

  function clickLikeHuman(el) {
    if (!el) return;
    try {
      el.disabled = false;
      el.removeAttribute("disabled");
      el.removeAttribute("aria-disabled");
    } catch (_) {}
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.max(2, rect.width / 2);
    const y = rect.top + Math.max(2, rect.height / 2);
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      buttons: 1
    };
    for (const type of ["pointerover", "pointerenter", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse" }));
      } catch (_) {
        try {
          el.dispatchEvent(new MouseEvent(type, opts));
        } catch (__) {}
      }
    }
    try {
      el.click();
    } catch (_) {}
    const inner = el.querySelector?.("button, .ytp-skip-ad-button__text, span, div");
    if (inner && inner !== el) {
      try {
        inner.click();
      } catch (_) {}
    }
  }

  function findSkipButtons() {
    const player = getPlayer() || document;
    const found = new Set();
    try {
      player.querySelectorAll(SKIP_SELECTORS).forEach((b) => found.add(b));
    } catch (_) {}
    try {
      player.querySelectorAll("button, [role='button']").forEach((b) => {
        if (looksLikeSkip(b)) found.add(b);
      });
    } catch (_) {}
    return [...found].filter((el) => isVisible(el) || looksLikeSkip(el));
  }

  function jumpAdToEnd(video) {
    if (!video) return false;
    const dur = video.duration;
    if (!dur || !isFinite(dur) || dur < 0.4) return false;
    try {
      if (dur - video.currentTime > 0.2) {
        video.currentTime = Math.max(0, dur - 0.05);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function bindVideo(video) {
    if (!video || video === boundVideo) return;
    boundVideo = video;
    if (!adActive) {
      userRate = video.playbackRate && video.playbackRate <= 2 ? video.playbackRate : 1;
      userMuted = video.muted;
      userVolume = video.volume;
    }
    video.addEventListener("ratechange", () => {
      if (adActive) return;
      const rate = video.playbackRate || 1;
      if (rate > 0 && rate <= 2) userRate = rate;
    });
    video.addEventListener("volumechange", () => {
      if (adActive) return;
      userMuted = video.muted;
      userVolume = video.volume;
    });
  }

  function restoreUserPlayback(video) {
    if (!video) return;
    try {
      video.playbackRate = userRate || 1;
    } catch (_) {}
    video.muted = userMuted;
    video.volume = userVolume;
  }

  function handleAds() {
    const video = getVideo();
    if (video) bindVideo(video);
    const playingAd = isAdPlaying();

    if (playingAd && !adActive && video) {
      adActive = true;
      if (video.playbackRate && video.playbackRate <= 2) userRate = video.playbackRate;
      userMuted = video.muted;
      userVolume = video.volume;
      if (settings.muteAds) {
        video.muted = true;
      }
      if (settings.speedAds) {
        const speed = Number(settings.adSpeed) || 16;
        try {
          video.playbackRate = Math.min(16, Math.max(2, speed));
        } catch (_) {}
      }
    }

    if (playingAd && settings.skipAds) {
      const buttons = findSkipButtons();
      const now = Date.now();
      if (buttons.length && now - lastSkipAt > 250) {
        buttons.forEach(clickLikeHuman);
        jumpAdToEnd(video);
        lastSkipAt = now;
        chrome.runtime.sendMessage({ type: "INCREMENT_SKIP" }).catch(() => {});
      }
      const preview = document.querySelector(".ytp-ad-preview-container, .ytp-preview-ad, .ytp-ad-text.ytp-ad-preview-text-modern");
      if (!buttons.length && preview && video && video.currentTime >= 5) {
        jumpAdToEnd(video);
      }
      document.querySelectorAll(OVERLAY_AD_SELECTORS).forEach((el) => {
        if (isVisible(el)) clickLikeHuman(el);
      });
    }

    if (!playingAd) {
      if (adActive && video) {
        adActive = false;
        restoreUserPlayback(video);
      } else if (video && video.playbackRate > 2) {
        restoreUserPlayback(video);
      }
    }
  }

  function ensureOverlay() {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.id = "ytfarsi-overlay";
    overlayEl.innerHTML =
      '<div class="ytfarsi-orig"></div><div class="ytfarsi-fa"></div>';
    (document.body || document.documentElement).appendChild(overlayEl);
    applyOverlayStyle();
    return overlayEl;
  }

  function applyOverlayStyle() {
    if (!overlayEl) return;
    overlayEl.style.setProperty("--ytfarsi-size", (settings.fontSize || 22) + "px");
    overlayEl.classList.toggle("show-orig", !!settings.showOriginal);
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.classList.remove("visible");
  }

  function showOverlay(original, translated) {
    const el = ensureOverlay();
    el.querySelector(".ytfarsi-orig").textContent = original || "";
    el.querySelector(".ytfarsi-fa").textContent = translated || "";
    el.classList.toggle("visible", !!(translated || (settings.showOriginal && original)));
  }

  function readNativeCaption() {
    const parts = [...document.querySelectorAll(CAPTION_SELECTORS)]
      .map((n) => (n.innerText || n.textContent || "").trim())
      .filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  async function translateText(text) {
    if (cache.has(text)) return cache.get(text);
    try {
      const res = await chrome.runtime.sendMessage({ type: "TRANSLATE", texts: [text] });
      const translated = res?.ok ? res.translations?.[0] || text : text;
      cache.set(text, translated);
      if (cache.size > 400) {
        const first = cache.keys().next().value;
        cache.delete(first);
      }
      return translated;
    } catch (_) {
      return text;
    }
  }

  function speakFa(text) {
    if (!settings.dubVoice || !text || !window.speechSynthesis) return;
    if (text === lastSpoken) return;
    lastSpoken = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices() || [];
    const fa =
      voices.find((v) => /^fa/i.test(v.lang)) ||
      voices.find((v) => /persian|farsi|iran/i.test(v.name));
    if (fa) u.voice = fa;
    u.lang = "fa-IR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  async function handleCaptions() {
    if (!settings.translateSubs && !settings.dubVoice) {
      hideOverlay();
      return;
    }
    if (isAdPlaying()) {
      hideOverlay();
      return;
    }
    const original = readNativeCaption();
    if (!original) {
      hideOverlay();
      return;
    }
    if (original === lastCaptionKey) return;
    lastCaptionKey = original;
    const translated = await translateText(original);
    if (settings.translateSubs) showOverlay(original, translated);
    else hideOverlay();
    if (settings.dubVoice) speakFa(translated);
  }

  function tick() {
    try {
      handleAds();
    } catch (_) {}
    try {
      handleCaptions();
    } catch (_) {}
  }

  function startObserver() {
    if (observer) observer.disconnect();
    const player = getPlayer() || document.documentElement;
    observer = new MutationObserver(() => {
      handleAds();
    });
    observer.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  setInterval(tick, 200);
  startObserver();
  document.addEventListener("yt-navigate-finish", () => {
    lastCaptionKey = "";
    lastSpoken = "";
    adActive = false;
    boundVideo = null;
    hideOverlay();
    const video = getVideo();
    if (video && video.playbackRate > 2) restoreUserPlayback(video);
    setTimeout(startObserver, 250);
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    tick();
  } else {
    document.addEventListener("DOMContentLoaded", tick, { once: true });
  }
})();
