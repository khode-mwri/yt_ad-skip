const DEFAULTS = {
  skipAds: true,
  muteAds: true,
  speedAds: true,
  adSpeed: 16,
  translateSubs: true,
  showOriginal: false,
  dubVoice: false,
  fontSize: 22,
  skippedCount: 0,
  translatorEngine: "gemini"
};

const GEMINI_MODEL = "gemini-3.5-flash-lite";

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (current[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "INCREMENT_SKIP") {
    chrome.storage.sync.get({ skippedCount: 0 }).then(({ skippedCount }) => {
      chrome.storage.sync.set({ skippedCount: skippedCount + 1 });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "TRANSLATE") {
    translateBatch(msg.texts || [])
      .then((translations) => sendResponse({ ok: true, translations }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

async function getEngineSettings() {
  const sync = await chrome.storage.sync.get({ translatorEngine: "gemini" });
  const local = await chrome.storage.local.get({ geminiApiKey: "" });
  return {
    engine: sync.translatorEngine || "gemini",
    apiKey: (local.geminiApiKey || "").trim()
  };
}

async function translateBatch(texts) {
  const { engine, apiKey } = await getEngineSettings();
  const out = [];
  for (const text of texts) {
    if (engine === "gemini" && apiKey) {
      try {
        out.push(await translateGemini(text, apiKey));
        continue;
      } catch (_) {
        out.push(await translateGoogle(text));
        continue;
      }
    }
    out.push(await translateGoogle(text));
  }
  return out;
}

async function translateGemini(text, apiKey) {
  const q = (text || "").trim();
  if (!q) return "";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "تو مترجم زیرنویس هستی. فقط ترجمه طبیعی فارسی را برگردان. هیچ توضیح، گیومه یا متن اضافه ننویس."
          }
        ]
      },
      contents: [{ role: "user", parts: [{ text: q }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256
      }
    })
  });
  if (!res.ok) throw new Error("gemini_http_" + res.status);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
  return out || q;
}

async function translateGoogle(text) {
  const q = (text || "").trim();
  if (!q) return "";
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fa&dt=t&q=" +
    encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error("translate_http_" + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) return q;
  return data[0].map((part) => part?.[0] || "").join("");
}
