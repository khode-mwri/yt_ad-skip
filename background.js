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
      .catch((err) => sendResponse({ ok: false, error: String(err), cues: [] }));
    return true;
  }
});

function normalizeCaptionUrl(raw, fmt) {
  if (!raw) return "";
  let s = String(raw).replace(/&amp;/g, "&").replace(/\\u0026/g, "&").trim();
  if (s.startsWith("//")) s = "https:" + s;
  if (s.startsWith("/")) s = "https://www.youtube.com" + s;
  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return "";
  }
  if (fmt) u.searchParams.set("fmt", fmt);
  return u.toString();
}

function allowedCaptionUrl(url) {
  try {
    const h = new URL(url).hostname;
    return (
      /(^|\.)youtube\.com$/i.test(h) ||
      /(^|\.)youtu\.be$/i.test(h) ||
      /(^|\.)googlevideo\.com$/i.test(h) ||
      /(^|\.)youtube-nocookie\.com$/i.test(h)
    );
  } catch (_) {
    return false;
  }
}

function parseJson3(data) {
  const cues = [];
  for (const ev of data.events || []) {
    if (!ev || ev.tStartMs == null) continue;
    const text = (ev.segs || [])
      .map((s) => s.utf8 || "")
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      start: ev.tStartMs / 1000,
      end: (ev.tStartMs + (ev.dDurationMs || 2500)) / 1000,
      text
    });
  }
  return cues;
}

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSrv3(xml) {
  const cues = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(xml))) {
    const attrs = m[1] || "";
    const t = Number((attrs.match(/\bt=["']?(\d+)/) || [])[1]);
    const d = Number((attrs.match(/\bd=["']?(\d+)/) || [])[1] || 2500);
    const text = decodeXml(m[2]);
    if (!text || Number.isNaN(t)) continue;
    cues.push({ start: t / 1000, end: (t + d) / 1000, text });
  }
  if (cues.length) return cues;
  const tRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  while ((m = tRe.exec(xml))) {
    const attrs = m[1] || "";
    const start = Number((attrs.match(/\bstart=["']?([\d.]+)/) || [])[1]);
    const dur = Number((attrs.match(/\bdur=["']?([\d.]+)/) || [])[1] || 2.5);
    const text = decodeXml(m[2]);
    if (!text || Number.isNaN(start)) continue;
    cues.push({ start, end: start + dur, text });
  }
  return cues;
}

function parseVtt(vtt) {
  const cues = [];
  const blocks = String(vtt || "").split(/\r?\n\r?\n/);
  const timeRe = /(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (hh, mm, ss, ms) =>
    Number(hh || 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;
    const idx = lines.findIndex((l) => timeRe.test(l));
    if (idx < 0) continue;
    const tm = lines[idx].match(timeRe);
    const text = lines
      .slice(idx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      start: toSec(tm[1], tm[2], tm[3], tm[4]),
      end: toSec(tm[5], tm[6], tm[7], tm[8]),
      text
    });
  }
  return cues;
}

function parseCaptionBody(body) {
  const raw = String(body || "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return parseJson3(JSON.parse(raw));
    } catch (_) {}
  }
  if (raw.includes("<timedtext") || raw.includes("<p ") || raw.includes("<text ")) {
    return parseSrv3(raw);
  }
  if (/WEBVTT/i.test(raw) || /-->/.test(raw)) return parseVtt(raw);
  return [];
}

async function fetchTimedText(url) {
  const formats = ["json3", "srv3", "vtt"];
  let lastErr = "empty";
  for (const fmt of formats) {
    const joined = normalizeCaptionUrl(url, fmt);
    if (!allowedCaptionUrl(joined)) {
      lastErr = "bad_caption_url";
      continue;
    }
    try {
      const res = await fetch(joined, { credentials: "include" });
      if (!res.ok) {
        lastErr = "http_" + res.status;
        continue;
      }
      const body = await res.text();
      const cues = parseCaptionBody(body);
      if (cues.length) return cues;
      lastErr = "no_cues_" + fmt;
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(lastErr);
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
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
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
