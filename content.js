(() => {
  "use strict";

  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button", ".ytp-skip-ad-button__text",
    ".ytp-ad-skip-button", ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-skip-ad-button", "button.ytp-ad-skip-button-modern",
    ".videoAdUiSkipButton"
  ].join(",");
  const OVERLAY_AD_SELECTORS = [
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container button",
    ".ytp-ad-overlay-close-container"
  ].join(",");
  const PREMIUM_DISMISS_SELECTORS = [
    "ytd-mealbar-promo-renderer #dismiss-button button",
    "ytd-mealbar-promo-renderer #dismiss-button",
    "yt-mealbar-promo-renderer #dismiss-button button",
    "ytd-banner-promo-renderer-background #dismiss-button",
    "ytd-popup-container ytd-mealbar-promo-renderer button",
    ".ytp-premium-overlay .ytp-premium-overlay-close-button",
    ".ytp-ad-overlay-close-button"
  ].join(",");
  const CAPTION_SELECTORS = ".ytp-caption-segment,.caption-window .ytp-caption-segment,.ytp-caption-window-container .ytp-caption-segment";
  const DEFAULTS = {
    skipAds: true, muteAds: true, speedAds: true, adSpeed: 16,
    translateSubs: true, showOriginal: false, dubVoice: false, fontSize: 22,
    translatorEngine: "youtube"
  };

  let settings = { ...DEFAULTS };
  let adActive = false, userRate = 1, userMuted = false, userVolume = 1, lastSkipAt = 0, lastDismissAt = 0, lastPlayNudgeAt = 0;
  let lastSpoken = "", lastCaptionKey = "", pendingCaption = "", captionSettleAt = 0;
  const cache = new Map();
  let overlayEl = null, observer = null, boundVideo = null;
  let cueList = [], cueIndex = 0, activeVideoId = "", captionState = "", loadToken = 0, useLiveFallback = false;

  chrome.storage.sync.get(DEFAULTS, (stored) => { settings = { ...DEFAULTS, ...stored }; applyOverlayStyle(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) if (k in settings || k in DEFAULTS) settings[k] = v.newValue;
    applyOverlayStyle();
    if (!settings.translateSubs) hideOverlay();
    if (!settings.dubVoice) window.speechSynthesis?.cancel();
  });

  function getPlayer() { return document.querySelector("#movie_player") || document.querySelector(".html5-video-player"); }
  function getVideo() {
    const player = getPlayer();
    if (player) { const v = player.querySelector("video.html5-main-video, video"); if (v) return v; }
    return document.querySelector("video.html5-main-video");
  }
  function isVisible(el) {
    if (!el) return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    return r.width > 1 && r.height > 1;
  }
  function nodeText(el) {
    return ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "")).toLowerCase();
  }
  function isPremiumUpsell(el) {
    if (!el) return false;
    const t = nodeText(el);
    if (/premium|subscribe|trial|upgrade|youtube tv|get premium|try it free|پریمیوم|اشتراک/.test(t)) return true;
    return !!(el.closest && el.closest("ytd-mealbar-promo-renderer, yt-mealbar-promo-renderer, ytd-premium-intro-renderer, .ytp-premium-overlay"));
  }
  function looksLikeSkip(el) {
    if (!el || isPremiumUpsell(el)) return false;
    const t = nodeText(el).replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (/premium|subscribe|trial|upgrade/.test(t)) return false;
    return /skip\s*(ad|ads)?\b|رد\s*(کردن|تبلیغ)|عبور|пропуст|saltar|überspring|passer|スキップ|건너뛰/.test(t);
  }
  function looksLikeDismiss(el) {
    if (!el) return false;
    const t = nodeText(el);
    return /\bno thanks\b|not now|dismiss|close|نه ممنون|بستن|بند نه|نه مرسی/.test(t);
  }
  function isAdPlaying() {
    const player = getPlayer();
    return !!(player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")));
  }
  function clickLikeHuman(el) {
    if (!el) return;
    try { el.disabled = false; el.removeAttribute("disabled"); el.removeAttribute("aria-disabled"); } catch (_) {}
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + Math.max(2, rect.width / 2), clientY: rect.top + Math.max(2, rect.height / 2), buttons: 1 };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try { el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse" })); }
      catch (_) { try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (__) {} }
    }
    try { el.click(); } catch (_) {}
  }
  function findSkipButtons() {
    const player = getPlayer() || document;
    const found = new Set();
    try {
      player.querySelectorAll(SKIP_SELECTORS).forEach((b) => {
        const btn = b.tagName === "BUTTON" || b.getAttribute("role") === "button" ? b : (b.querySelector("button") || b);
        if (!isPremiumUpsell(btn)) found.add(btn);
      });
    } catch (_) {}
    try {
      player.querySelectorAll("button, [role='button']").forEach((b) => {
        if (looksLikeSkip(b) && !isPremiumUpsell(b)) found.add(b);
      });
    } catch (_) {}
    return [...found].filter((el) => isVisible(el));
  }
  function dismissPremiumAndOverlays() {
    const now = Date.now();
    if (now - lastDismissAt < 900) return;
    const nodes = new Set();
    try { document.querySelectorAll(PREMIUM_DISMISS_SELECTORS).forEach((n) => nodes.add(n)); } catch (_) {}
    try { document.querySelectorAll(OVERLAY_AD_SELECTORS).forEach((n) => nodes.add(n)); } catch (_) {}
    document.querySelectorAll("ytd-mealbar-promo-renderer button, yt-mealbar-promo-renderer button").forEach((b) => {
      if (looksLikeDismiss(b) || /dismiss|no thanks|نه/.test(nodeText(b))) nodes.add(b);
    });
    let clicked = false;
    nodes.forEach((el) => {
      const target = el.tagName === "BUTTON" || el.getAttribute("role") === "button" ? el : (el.querySelector("button") || el);
      if (isVisible(target) && !looksLikeSkip(target)) {
        clickLikeHuman(target);
        clicked = true;
      }
    });
    if (clicked) lastDismissAt = now;
  }
  function jumpAdToEnd(video) {
    if (!video || !video.duration || !isFinite(video.duration)) return false;
    try {
      if (video.duration - video.currentTime > 0.15) {
        video.currentTime = Math.max(0, video.duration - 0.05);
        return true;
      }
    } catch (_) {}
    return false;
  }
  function clickPlayIfStuck(video) {
    const now = Date.now();
    if (now - lastPlayNudgeAt < 900) return;
    const player = getPlayer();
    if (!player || isAdPlaying()) return;
    lastPlayNudgeAt = now;
    if (video && video.paused) {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }
  }
  function bindVideo(video) {
    if (!video || video === boundVideo) return;
    boundVideo = video;
    if (!adActive) {
      userRate = video.playbackRate && video.playbackRate <= 2 ? video.playbackRate : 1;
      userMuted = video.muted; userVolume = video.volume;
    }
    video.addEventListener("ratechange", () => { if (!adActive && video.playbackRate > 0 && video.playbackRate <= 2) userRate = video.playbackRate; });
    video.addEventListener("volumechange", () => { if (!adActive) { userMuted = video.muted; userVolume = video.volume; } });
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
    dismissPremiumAndOverlays();
    if (playingAd && !adActive && video) {
      adActive = true;
      if (video.playbackRate && video.playbackRate <= 2) userRate = video.playbackRate;
      userMuted = video.muted; userVolume = video.volume;
      if (settings.muteAds) video.muted = true;
      if (settings.speedAds) { try { video.playbackRate = Math.min(16, Math.max(2, Number(settings.adSpeed) || 16)); } catch (_) {} }
    }
    if (playingAd && settings.skipAds) {
      const buttons = findSkipButtons();
      if (buttons.length && Date.now() - lastSkipAt > 700) {
        clickLikeHuman(buttons[0]);
        jumpAdToEnd(video);
        lastSkipAt = Date.now();
        chrome.runtime.sendMessage({ type: "INCREMENT_SKIP" }).catch(() => {});
      } else if (!buttons.length && video && video.currentTime > 4.8) {
        jumpAdToEnd(video);
      }
    }
    if (!playingAd) {
      if (adActive && video) {
        adActive = false;
        restoreUserPlayback(video);
        clickPlayIfStuck(video);
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
  function hideOverlay() { if (overlayEl) overlayEl.classList.remove("visible"); }
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
    return short ? short[1] : "";
  }
  function extractJsonAfter(source, marker) {
    const i = source.indexOf(marker);
    if (i < 0) return null;
    const start = source.indexOf("{", i);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let n = start; n < source.length; n++) {
      const ch = source[n];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") { depth -= 1; if (depth === 0) { try { return JSON.parse(source.slice(start, n + 1)); } catch (_) { return null; } } }
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
    for (const s of document.querySelectorAll("script")) {
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
    return tracks.map((t) => {
      const lang = (t.languageCode || "").toLowerCase();
      let score = 0;
      if (t.kind !== "asr") score += 5;
      if (lang.startsWith("en")) score += 4;
      if (lang.startsWith("fa") || lang.startsWith("pe")) score += 8;
      if (t.baseUrl) score += 2;
      return { t, score };
    }).sort((a, b) => b.score - a.score)[0].t;
  }

  async function translateText(text, fast) {
    if (cache.has(text)) return cache.get(text);
    try {
      const res = await chrome.runtime.sendMessage({ type: "TRANSLATE", texts: [text], fast: !!fast });
      const translated = res?.ok ? res.translations?.[0] || text : text;
      cache.set(text, translated);
      return translated;
    } catch (_) { return text; }
  }
  function speakFa(text) {
    if (!settings.dubVoice || !text || !window.speechSynthesis || text === lastSpoken) return;
    lastSpoken = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices() || [];
    const fa = voices.find((v) => /^fa/i.test(v.lang)) || voices.find((v) => /persian|farsi|iran/i.test(v.name));
    if (fa) u.voice = fa;
    u.lang = "fa-IR"; u.rate = 1.08;
    window.speechSynthesis.speak(u);
  }

  function nearestIndex(time) {
    if (!cueList.length) return 0;
    let lo = 0, hi = cueList.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cueList[mid].start <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  async function refineAroundPlayhead(token) {
    const engine = settings.translatorEngine || "youtube";
    if (engine === "youtube") return;
    const video = getVideo();
    const t = video ? video.currentTime || 0 : 0;
    const start = nearestIndex(t);
    const slice = cueList.slice(start, start + 24);
    const need = [];
    const seen = new Set();
    slice.forEach((c) => {
      if (c.text && !seen.has(c.text) && !cache.has(c.text)) { seen.add(c.text); need.push(c.text); }
    });
    if (!need.length) return;
    try {
      const tr = await chrome.runtime.sendMessage({ type: "TRANSLATE", texts: need, fast: engine !== "gemini" });
      if (token !== loadToken || !tr?.ok) return;
      need.forEach((src, n) => {
        const val = tr.translations?.[n] || src;
        cache.set(src, val);
        cueList.forEach((c) => { if (c.text === src) c.fa = val; });
      });
    } catch (_) {}
  }

  async function loadCuesForVideo(videoId) {
    const token = ++loadToken;
    cueList = []; cueIndex = 0; useLiveFallback = false;
    setCaptionState("دریافت زیرنویس…");
    let pr = getPlayerResponse();
    for (let wait = 0; wait < 8 && !pickCaptionTrack(pr); wait += 1) {
      await new Promise((r) => setTimeout(r, 500));
      if (token !== loadToken) return;
      pr = getPlayerResponse();
    }
    const track = pickCaptionTrack(pr);
    if (!track?.baseUrl) {
      useLiveFallback = true;
      setCaptionState("ترک کامل نیست — CC را روشن کن");
      return;
    }
    const lang = (track.languageCode || "").toLowerCase();
    const alreadyFa = lang.startsWith("fa") || lang.startsWith("pe");
    setCaptionState("دانلود ترک فارسی یوتیوب…");
    const [origRes, faRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "FETCH_TIMEDTEXT", url: track.baseUrl }).catch(() => null),
      alreadyFa ? Promise.resolve(null) : chrome.runtime.sendMessage({ type: "FETCH_TIMEDTEXT", url: track.baseUrl, tlang: "fa" }).catch(() => null)
    ]);
    if (token !== loadToken) return;
    const orig = origRes?.cues || [];
    const fa = alreadyFa ? orig : (faRes?.cues || []);
    if (!orig.length && !fa.length) {
      useLiveFallback = true;
      setCaptionState("فایل کپشن نخوانده شد — CC را روشن کن");
      return;
    }
    const base = orig.length ? orig : fa;
    cueList = base.map((c, i) => {
      const faLine = fa[i] && Math.abs((fa[i].start || 0) - c.start) < 0.45 ? fa[i].text : (fa[i]?.text || c.text);
      return { start: c.start, end: c.end, text: c.text, fa: faLine || c.text };
    });
    if (!orig.length && fa.length) {
      cueList = fa.map((c) => ({ start: c.start, end: c.end, text: c.text, fa: c.text }));
    }
    setCaptionState(cueList.length + " خط آماده — همگام با پخش");
    setTimeout(() => { if (captionState.includes("همگام")) setCaptionState(""); }, 2200);
    refineAroundPlayhead(token).catch(() => {});
  }

  function findCue(time) {
    if (!cueList.length) return null;
    let i = nearestIndex(time);
    cueIndex = i;
    const c = cueList[i];
    if (c && time >= c.start - 0.12 && time <= c.end + 0.4) return c;
    return null;
  }
  function readNativeCaption() {
    return [...document.querySelectorAll(CAPTION_SELECTORS)].map((n) => (n.innerText || n.textContent || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  function isGrowingCaption(prev, next) {
    if (!prev || !next || next === prev) return false;
    if (next.startsWith(prev)) return true;
    const pw = prev.split(/\s+/), nw = next.split(/\s+/);
    return nw.length > pw.length && next.startsWith(pw.slice(0, -1).join(" "));
  }
  async function handleLiveCaption() {
    const original = readNativeCaption();
    if (!original || original === lastCaptionKey) return;
    const now = Date.now();
    if (isGrowingCaption(pendingCaption || lastCaptionKey, original) || original !== pendingCaption) {
      pendingCaption = original; captionSettleAt = now + 280; return;
    }
    if (pendingCaption && now >= captionSettleAt) {
      lastCaptionKey = pendingCaption;
      const translated = await translateText(pendingCaption, true);
      if (settings.translateSubs) showOverlay(pendingCaption, translated);
      if (settings.dubVoice) speakFa(translated);
    }
  }
  function handlePrefetchedCaption() {
    const video = getVideo();
    if (!video || !cueList.length) return;
    const cue = findCue(video.currentTime || 0);
    if (!cue) { if (!captionState) hideOverlay(); return; }
    if (cue.text === lastCaptionKey) { showOverlay(cue.text, cue.fa); return; }
    lastCaptionKey = cue.text;
    if (settings.translateSubs) showOverlay(cue.text, cue.fa);
    if (settings.dubVoice) speakFa(cue.fa);
  }
  function handleCaptions() {
    if (!settings.translateSubs && !settings.dubVoice) { hideOverlay(); return; }
    if (isAdPlaying()) { hideOverlay(); return; }
    const id = getVideoId();
    if (id && id !== activeVideoId) {
      activeVideoId = id;
      loadCuesForVideo(id).catch(() => { useLiveFallback = true; setCaptionState("CC را روشن کن"); });
    }
    if (cueList.length) handlePrefetchedCaption();
    else if (useLiveFallback) handleLiveCaption();
  }
  function tick() { try { handleAds(); } catch (_) {} try { handleCaptions(); } catch (_) {} }
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => handleAds());
    observer.observe(getPlayer() || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  setInterval(tick, 160);
  startObserver();
  document.addEventListener("yt-navigate-finish", () => {
    lastCaptionKey = ""; pendingCaption = ""; lastSpoken = "";
    cueList = []; cueIndex = 0; activeVideoId = ""; captionState = ""; useLiveFallback = false; loadToken += 1;
    adActive = false; boundVideo = null; hideOverlay();
    const video = getVideo();
    if (video && video.playbackRate > 2) restoreUserPlayback(video);
    setTimeout(startObserver, 200);
  });
  if (document.readyState === "complete" || document.readyState === "interactive") tick();
  else document.addEventListener("DOMContentLoaded", tick, { once: true });
})();
