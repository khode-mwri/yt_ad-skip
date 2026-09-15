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

  if (msg?.type === "FETCH_TIMEDTEXT") {
    fetchTimedText(msg.url)
      .then((cues) => sendResponse({ ok: true, cues }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

async function fetchTimedText(url) {
  if (!url || !/^https:\/\/(www\.)?youtube\.com\//.test(url)) {
    throw new Error("bad_caption_url");
  }
  const joined = url.includes("fmt=") ? url : url + (url.includes("?") ? "&" : "?") + "fmt=json3";
  const res = await fetch(joined);
  if (!res.ok) throw new Error("timedtext_" + res.status);
  const data = await res.json();
  const cues = [];
  for (const ev of data.events || []) {
    if (!ev || ev.tStartMs == null) continue;
    const text = (ev.segs || [])
      .map((s) => s.utf8 || "")
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text === "\n") continue;
    cues.push({
      start: ev.tStartMs / 1000,
      end: (ev.tStartMs + (ev.dDurationMs || 2000)) / 1000,
      text
    });
  }
  return cues;
}

async function getEngineSettings() {
  const sync = await chrome.storage.sync.get({ translatorEngine: "gemini" });
  const local = await chrome.storage.local.get({ geminiApiKey: "" });
  return {
    engine: sync.translatorEngine || "gemini",
    apiKey: (local.geminiApiKey || "").trim()
  };
}

async function translateBatch(texts) {
  const clean = (texts || []).map((t) => String(t || "").trim());
  const { engine, apiKey } = await getEngineSettings();
  if (engine === "gemini" && apiKey) {
    try {
      return await translateGeminiMany(clean, apiKey);
    } catch (_) {}
  }
  const out = [];
  const chunk = 8;
  for (let i = 0; i < clean.length; i += chunk) {
    const slice = clean.slice(i, i + chunk);
    const parts = await Promise.all(slice.map((t) => translateGoogle(t)));
    out.push(...parts);
  }
  return out;
}

async function translateGeminiMany(texts, apiKey) {
  const results = new Array(texts.length).fill("");
  const pending = [];
  texts.forEach((t, i) => {
    if (!t) results[i] = "";
    else pending.push(i);
  });
  const size = 25;
  for (let i = 0; i < pending.length; i += size) {
    const idxs = pending.slice(i, i + size);
    const payload = idxs.map((idx, n) => n + 1 + ". " + texts[idx]).join("\n");
    const translated = await translateGemini(
      "این خط‌ها را به فارسی روان ترجمه کن. هر خط را با همان شماره برگردان و هیچ چیز اضافه ننویس.\n" + payload,
      apiKey
    );
    const map = parseNumbered(translated);
    idxs.forEach((idx, n) => {
      results[idx] = map[n + 1] || texts[idx];
    });
  }
  return results;
}

function parseNumbered(block) {
  const map = {};
  String(block || "")
    .split(/\n+/)
    .forEach((line) => {
      const m = line.match(/^\s*(\d+)[\.\-\:\)]\s*(.+)$/);
      if (m) map[Number(m[1])] = m[2].trim();
    });
  return map;
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
        maxOutputTokens: 2048
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
