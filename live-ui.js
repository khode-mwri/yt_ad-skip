(() => {
  let lastAd = false;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "DUB_TEXT") {
      const el = document.getElementById("ytfarsi-overlay");
      if (!el) return;
      const fa = el.querySelector(".ytfarsi-fa");
      const orig = el.querySelector(".ytfarsi-orig");
      const st = el.querySelector(".ytfarsi-status");
      if (fa && msg.fa) fa.textContent = msg.fa;
      if (orig && msg.original) orig.textContent = msg.original;
      if (st && msg.fa) st.textContent = "دوبله زنده";
      el.classList.add("visible");
    }
    if (msg?.type === "DUB_STATUS") {
      const el = document.getElementById("ytfarsi-overlay");
      if (!el) return;
      const st = el.querySelector(".ytfarsi-status");
      if (st) st.textContent = msg.text || "";
      el.classList.add("visible");
    }
  });
  setInterval(() => {
    const player = document.querySelector("#movie_player, .html5-video-player");
    const ad = !!(player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")));
    if (ad !== lastAd) {
      lastAd = ad;
      chrome.runtime.sendMessage({ type: ad ? "DUB_PAUSE" : "DUB_RESUME" }).catch(() => {});
    }
  }, 300);
})();
