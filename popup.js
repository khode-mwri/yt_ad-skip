const KEYS = ["skipAds","muteAds","speedAds","translateSubs","showOriginal","liveDub","fontSize","skippedCount","translatorEngine"];
const DEFAULTS = {
  skipAds: true,
  muteAds: true,
  speedAds: true,
  translateSubs: true,
  showOriginal: false,
  liveDub: false,
  fontSize: 22,
  skippedCount: 0,
  translatorEngine: "youtube"
};

function bind() {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    KEYS.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) {
        if (key === "skippedCount") document.getElementById("skippedCount").textContent = data.skippedCount || 0;
        return;
      }
      if (el.type === "checkbox") el.checked = !!data[key];
      else if (el.type === "range") {
        el.value = data[key];
        document.getElementById("fontVal").textContent = data[key];
      } else if (el.tagName === "SELECT") el.value = data[key] || "youtube";
    });
  });
  chrome.storage.local.get({ geminiApiKey: "" }, ({ geminiApiKey }) => {
    const el = document.getElementById("geminiApiKey");
    if (el) el.value = geminiApiKey || "";
  });
  KEYS.forEach((key) => {
    const el = document.getElementById(key);
    if (!el || key === "skippedCount") return;
    el.addEventListener("change", () => {
      const value = el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value;
      chrome.storage.sync.set({ [key]: value });
      if (key === "fontSize") document.getElementById("fontVal").textContent = value;
      if (key === "liveDub") chrome.runtime.sendMessage({ type: value ? "START_LIVE_DUB" : "STOP_LIVE_DUB" });
    });
    el.addEventListener("input", () => {
      if (el.type === "range") {
        document.getElementById("fontVal").textContent = el.value;
        chrome.storage.sync.set({ fontSize: Number(el.value) });
      }
    });
  });
  const keyEl = document.getElementById("geminiApiKey");
  if (keyEl) keyEl.addEventListener("change", () => chrome.storage.local.set({ geminiApiKey: keyEl.value.trim() }));
}
document.addEventListener("DOMContentLoaded", bind);
