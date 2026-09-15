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
  let pendingCaption = "";
  let captionSettleAt = 0;
  const cache = new Map();
  let overlayEl = null;
  let observer = null;
  let boundVideo = null;
  let cueList = [];
  let cueIndex = 0;
  let activeVideoId = "";
  let captionState = "";
  let loadToken = 0;
  let useLiveFallback = false;

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
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
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
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
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
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 };
    for (const type of ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse" }));
      } catch (_) {
        try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (__) {}
      }
    }
    try { el.click(); } catch (_) {}
  }

  function findSkipButtons() {
    const player = getPlayer() || document;
    const found = new Set();
    try { player.querySelectorAll(SKIP_SELECTORS).forEach((b) => found.add(b)); } catch (_) {}
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
    try { video.playbackRate = userRate || 1; } catch (_) {}
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
      if (settings.muteAds) video.muted = true;
      if (settings.speedAds) {
        try { video.playbackRate = Math.min(16, Math.max(2, Number(settings.adSpeed) || 16)); } catch (_) {}
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
    overlayEl.innerHTML = '<div class="ytfarsi-status"></div><div class="ytfarsi-orig"></div><div class="ytfarsi-fa"></div>';
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

  function setCaptionState(text) {
    captionState = text || "";
    const el = ensureOverlay();
    const st = el.querySelector(".ytfarsi-status");
    if (st) st.textContent = captionState;
    el.classList.toggle("visible", !!(captionState || el.querySelector(".ytfarsi-fa")?.textContent));
  }

  function showOverlay(original, translated) {
    const el = ensureOverlay();
    const st = el.querySelector(".ytfarsi-status");
    if (st) st.textContent = captionState || "";
    el.querySelector(".ytfarsi-orig").textContent = original || "";
    el.querySelector(".ytfarsi-fa").textContent = translated || "";
    el.classList.toggle("visible", !!(translated || (settings.showOriginal && original) || captionState));
  }

  function getVideoId() {
    const u = new URL(location.href);
    if (u.pathname === "/watch") return u.searchParams.get("v") || "";
    const short = u.pathname.match(/^\/shorts\/([^/?]+)/);
    if (short) return short[1];
    return "";
  }

  function extractJsonAfter(source, marker) {
    const i = source.indexOf(marker);
    if (i < 0) return null;
    const start = source.indexOf("{", i);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let n = start; n < source.length; n++) {
      const ch = source[n];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(source.slice(start, n + 1)); } catch (_) { return null; }
        }
      }
    }
    return null;
  }

  function getPlayerResponse() {
    try {
      const player = getPlayer();
      if (player && typeof player.getPlayerResponse === "function") {
        const pr = player.getPlayerResponse();
        if (pr?.captions || pr?.videoDetails) return pr;
      }
    } catch (_) {}
    if (window.ytInitialPlayerResponse?.captions) return window.ytInitialPlayerResponse;
    const scripts = document.querySelectorAll("script");
    for (const s of scripts) {
      const t = s.textContent || "";
      if (t.includes("ytInitialPlayerResponse")) {
        const pr = extractJsonAfter(t, "ytInitialPlayerResponse");
        if (pr?.captions || pr?.videoDetails) return pr;
      }
    }
    return null;
  }

  function pickCaptionTrack(pr) {
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) return null;
    const scored = tracks.map((t) => {
      const lang = (t.languageCode || "").toLowerCase();
      let score = 0;
      if (t.kind !== "asr") score += 5;
      if (lang.startsWith("en")) score += 4;
      if (lang.startsWith("fa") || lang.startsWith("pe")) score += 6;
      if (t.baseUrl) score += 2;
      return { t, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].t;
  }

  async function translateText(text) {
    if (cache.has(text)) return cache.get(text);
    try {
      const res = await chrome.runtime.sendMessage({ type: "TRANSLATE", texts: [text] });
      const translated = res?.ok ? res.translations?.[0] || text : text;
      cache.set(text, translated);
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
    const fa = voices.find((v) => /^fa/i.test(v.lang)) || voices.find((v) => /persian|farsi|iran/i.test(v.name));
    if (fa) u.voice = fa;
    u.lang = "fa-IR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }

  async function loadCuesForVideo(videoId) {
    const token = ++loadToken;
    cueList = [];
    cueIndex = 0;
    useLiveFallback = false;
    setCaptionState("در حال گرفتن زیرنویس کامل ویدیو…");
    let pr = getPlayerResponse();
    for (let wait = 0; wait < 8 && !pickCaptionTrack(pr); wait += 1) {
      setCaptionState("منتظر زیرنویس یوتیوب…");
      await new Promise((r) => setTimeout(r, 700));
      if (token !== loadToken) return;
      pr = getPlayerResponse();
    }
    const track = pickCaptionTrack(pr);
    if (!track?.baseUrl) {
      useLiveFallback = true;
      setCaptionState("ترک کامل نیست — اگر CC روشن باشد زنده ترجمه می‌شود");
      setTimeout(() => { if (captionState.includes("زنده")) setCaptionState(""); }, 4000);
      return;
    }
    setCaptionState(track.kind === "asr" ? "دانلود زیرنویس خودکار…" : "دانلود زیرنویس رسمی…");
    let cues = [];
    try {
      const res = await chrome.runtime.sendMessage({ type: "FETCH_TIMEDTEXT", url: track.baseUrl });
      if (res?.ok && res.cues?.length) cues = res.cues;
    } catch (_) {}
    if (token !== loadToken) return;
    if (!cues.length) {
      useLiveFallback = true;
      setCaptionState("فایل کپشن نخوانده شد — زیرنویس زنده CC را روشن کن");
      return;
    }
    const cacheKey = "capcache:" + videoId + ":" + (track.languageCode || "") + ":" + (track.kind || "m");
    let stored = null;
    try { stored = (await chrome.storage.local.get(cacheKey))[cacheKey]; } catch (_) {}
    const byText = new Map();
    if (stored?.map) Object.entries(stored.map).forEach(([k, v]) => byText.set(k, v));
    const unique = [];
    cues.forEach((c) => {
      if (c.text && !byText.has(c.text) && !unique.includes(c.text)) unique.push(c.text);
    });
    setCaptionState("ترجمه " + unique.length + " خط جدید از " + cues.length + " خط…");
    for (let i = 0; i < unique.length; i += 40) {
      if (token !== loadToken) return;
      const slice = unique.slice(i, i + 40);
      try {
        const tr = await chrome.runtime.sendMessage({ type: "TRANSLATE", texts: slice });
        if (tr?.ok) {
          slice.forEach((src, n) => {
            const val = tr.translations?.[n] || src;
            byText.set(src, val);
            cache.set(src, val);
          });
        }
      } catch (_) {
        slice.forEach((src) => byText.set(src, src));
      }
      setCaptionState("ترجمه شد " + Math.min(i + 40, unique.length) + " از " + unique.length);
    }
    cueList = cues.map((c) => ({ start: c.start, end: c.end, text: c.text, fa: byText.get(c.text) || c.text }));
    try {
      const map = {};
      byText.forEach((v, k) => { map[k] = v; });
      await chrome.storage.local.set({ [cacheKey]: { map, at: Date.now() } });
    } catch (_) {}
    setCaptionState(cueList.length + " خط آماده‌ست");
    setTimeout(() => { if (captionState.endsWith("آماده‌ست")) setCaptionState(""); }, 2500);
  }

  function findCue(time) {
    if (!cueList.length) return null;
    let i = cueIndex;
    if (i >= cueList.length) i = cueList.length - 1;
    if (i < 0) i = 0;
    while (i + 1 < cueList.length && cueList[i + 1].start <= time) i += 1;
    while (i > 0 && cueList[i].start > time) i -= 1;
    cueIndex = i;
    const c = cueList[i];
    if (time >= c.start - 0.15 && time <= c.end + 0.35) return c;
    return null;
  }

  function readNativeCaption() {
    const parts = [...document.querySelectorAll(CAPTION_SELECTORS)]
      .map((n) => (n.innerText || n.textContent || "").trim())
      .filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function isGrowingCaption(prev, next) {
    if (!prev || !next || next === prev) return false;
    if (next.startsWith(prev)) return true;
    const prevWords = prev.split(/\s+/);
    const nextWords = next.split(/\s+/);
    return nextWords.length > prevWords.length && next.startsWith(prevWords.slice(0, -1).join(" "));
  }

  async function handleLiveCaption() {
    const original = readNativeCaption();
    const now = Date.now();
    if (!original) return;
    if (original === lastCaptionKey) return;
    if (isGrowingCaption(pendingCaption || lastCaptionKey, original) || original !== pendingCaption) {
      pendingCaption = original;
      captionSettleAt = now + 450;
      return;
    }
    if (pendingCaption && now >= captionSettleAt) {
      lastCaptionKey = pendingCaption;
      const translated = await translateText(pendingCaption);
      if (settings.translateSubs) showOverlay(pendingCaption, translated);
      if (settings.dubVoice) speakFa(translated);
    }
  }

  function handlePrefetchedCaption() {
    const video = getVideo();
    if (!video || !cueList.length) return;
    const cue = findCue(video.currentTime || 0);
    if (!cue) {
      if (!captionState) hideOverlay();
      return;
    }
    if (cue.text === lastCaptionKey) {
      showOverlay(cue.text, cue.fa);
      return;
    }
    lastCaptionKey = cue.text;
    if (settings.translateSubs) showOverlay(cue.text, cue.fa);
    if (settings.dubVoice) speakFa(cue.fa);
  }

  function handleCaptions() {
    if (!settings.translateSubs && !settings.dubVoice) {
      hideOverlay();
      return;
    }
    if (isAdPlaying()) {
      hideOverlay();
      return;
    }
    const id = getVideoId();
    if (id && id !== activeVideoId) {
      activeVideoId = id;
      loadCuesForVideo(id).catch(() => {
        useLiveFallback = true;
        setCaptionState("خطا — زیرنویس زنده CC را روشن کن");
      });
    }
    if (cueList.length) handlePrefetchedCaption();
    else if (useLiveFallback) handleLiveCaption();
  }

  function tick() {
    try { handleAds(); } catch (_) {}
    try { handleCaptions(); } catch (_) {}
  }

  function startObserver() {
    if (observer) observer.disconnect();
    const player = getPlayer() || document.documentElement;
    observer = new MutationObserver(() => { handleAds(); });
    observer.observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  setInterval(tick, 200);
  startObserver();
  document.addEventListener("yt-navigate-finish", () => {
    lastCaptionKey = "";
    pendingCaption = "";
    lastSpoken = "";
    cueList = [];
    cueIndex = 0;
    activeVideoId = "";
    captionState = "";
    useLiveFallback = false;
    loadToken += 1;
    adActive = false;
    boundVideo = null;
    hideOverlay();
    const video = getVideo();
    if (video && video.playbackRate > 2) restoreUserPlayback(video);
    setTimeout(startObserver, 250);
  });

  if (document.readyState === "complete" || document.readyState === "interactive") tick();
  else document.addEventListener("DOMContentLoaded", tick, { once: true });
})();
