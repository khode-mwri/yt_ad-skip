(() => {
  const MODEL = "models/gemini-3.5-live-translate-preview";
  const WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

  let ws = null;
  let stream = null;
  let proc = null;
  let srcNode = null;
  let inCtx = null;
  let outCtx = null;
  let nextPlay = 0;
  let paused = false;
  let ready = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "OFFSCREEN_START") start(msg).catch((e) => status("خطا: " + e.message));
    if (msg?.type === "OFFSCREEN_STOP") stop();
    if (msg?.type === "OFFSCREEN_PAUSE") paused = true;
    if (msg?.type === "OFFSCREEN_RESUME") paused = false;
  });

  function status(text) {
    chrome.runtime.sendMessage({ type: "DUB_STATUS", text }).catch(() => {});
  }

  function b64ToU8(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function u8ToB64(u8) {
    let s = "";
    const step = 0x8000;
    for (let i = 0; i < u8.length; i += step) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
    }
    return btoa(s);
  }

  function resampleMono16k(float32, fromRate) {
    if (!float32.length) return new Int16Array(0);
    const ratio = fromRate / 16000;
    const len = Math.max(1, Math.floor(float32.length / ratio));
    const out = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x);
      const i1 = Math.min(float32.length - 1, i0 + 1);
      const f = x - i0;
      let s = float32[i0] * (1 - f) + float32[i1] * f;
      if (s > 1) s = 1;
      if (s < -1) s = -1;
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
  }

  function playPcm24(u8) {
    if (!u8 || u8.length < 4) return;
    const samples = new Int16Array(u8.buffer, u8.byteOffset, Math.floor(u8.byteLength / 2));
    if (!outCtx) outCtx = new AudioContext({ sampleRate: 24000 });
    const buf = outCtx.createBuffer(1, samples.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
    const node = outCtx.createBufferSource();
    node.buffer = buf;
    node.connect(outCtx.destination);
    const now = outCtx.currentTime;
    if (nextPlay < now) nextPlay = now;
    node.start(nextPlay);
    nextPlay += buf.duration;
  }

  async function start({ streamId, apiKey }) {
    stop();
    if (!apiKey) {
      status("کلید Gemini را در پاپ‌آپ بگذار");
      return;
    }
    status("گرفتن صدای تب…");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });
    inCtx = new AudioContext();
    srcNode = inCtx.createMediaStreamSource(stream);
    proc = inCtx.createScriptProcessor(4096, 1, 1);
    srcNode.connect(proc);
    proc.connect(inCtx.createGain());

    status("وصل به Gemini Live Translate…");
    ws = new WebSocket(WS_BASE + "?key=" + encodeURIComponent(apiKey));
    ws.binaryType = "arraybuffer";
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("websocket"));
    });
    ws.send(JSON.stringify({
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          translationConfig: { targetLanguageCode: "fa", echoTargetLanguage: false }
        }
      }
    }));

    ws.onmessage = (ev) => {
      let data = ev.data;
      if (typeof data !== "string") return;
      let msg;
      try { msg = JSON.parse(data); } catch (_) { return; }
      if (msg.setupComplete) {
        ready = true;
        status("دوبله زنده روشن است");
      }
      const sc = msg.serverContent || {};
      const parts = sc.modelTurn?.parts || [];
      parts.forEach((p) => {
        const inline = p.inlineData || p.inline_data;
        if (inline?.data) playPcm24(b64ToU8(inline.data));
      });
      const outT = sc.outputTranscription?.text || sc.output_transcription?.text;
      const inT = sc.inputTranscription?.text || sc.input_transcription?.text;
      if (outT) chrome.runtime.sendMessage({ type: "DUB_TEXT", original: inT || "", fa: outT }).catch(() => {});
      else if (inT) chrome.runtime.sendMessage({ type: "DUB_TEXT", original: inT, fa: "" }).catch(() => {});
    };
    ws.onclose = () => { ready = false; status("اتصال دوبله قطع شد"); };

    proc.onaudioprocess = (e) => {
      if (!ready || paused || !ws || ws.readyState !== 1) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = resampleMono16k(input, e.inputBuffer.sampleRate || inCtx.sampleRate);
      if (!pcm.length) return;
      const bytes = new Uint8Array(pcm.buffer);
      ws.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: u8ToB64(bytes) }
        }
      }));
    };
  }

  function stop() {
    ready = false;
    paused = false;
    try { ws && ws.close(); } catch (_) {}
    ws = null;
    try { proc && proc.disconnect(); } catch (_) {}
    try { srcNode && srcNode.disconnect(); } catch (_) {}
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { inCtx && inCtx.close(); } catch (_) {}
    proc = null; srcNode = null; stream = null; inCtx = null; nextPlay = 0;
  }
})();
