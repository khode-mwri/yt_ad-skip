const fixtures = [
  {
    name: "modern skip ready",
    html: '<div id="movie_player" class="ad-showing"><button class="ytp-skip-ad-button" aria-label="Skip ad"><div class="ytp-skip-ad-button__text">Skip</div></button></div>',
    expectSkip: true,
    expectPremium: false
  },
  {
    name: "countdown not ready",
    html: '<div id="movie_player" class="ad-showing"><button class="ytp-skip-ad-button" aria-label="Skip ad in 5 seconds">Skip in 5</button></div>',
    expectSkip: false,
    expectPremium: false
  },
  {
    name: "premium upsell must not count as skip",
    html: '<div id="movie_player" class="ad-showing"><button aria-label="Skip ads with YouTube Premium">Skip ads with Premium</button></div>',
    expectSkip: false,
    expectPremium: true
  },
  {
    name: "disabled skip not ready",
    html: '<div id="movie_player" class="ad-showing"><button class="ytp-ad-skip-button-modern" disabled aria-disabled="true">Skip</button></div>',
    expectSkip: false,
    expectPremium: false
  },
  {
    name: "persian skip",
    html: '<div id="movie_player" class="ad-showing"><button class="ytp-skip-ad-button" aria-label="رد کردن تبلیغ">رد کردن</button></div>',
    expectSkip: true,
    expectPremium: false
  }
];

function nodeText(el) {
  return ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "")).toLowerCase();
}
function isPremiumUpsell(el) {
  const t = nodeText(el);
  return /premium|subscribe|trial|upgrade|youtube tv|get premium|try it free|پریمیوم|اشتراک/.test(t);
}
function isCountdown(el) {
  return /skip(?:\s*ads?)?\s*in\s*\d|در\s*\d|\d+\s*(?:sec|s\b|ثانیه)/.test(nodeText(el));
}
function looksLikeSkip(el) {
  if (!el || isPremiumUpsell(el)) return false;
  const t = nodeText(el).replace(/\s+/g, " ").trim();
  if (!t || /premium|subscribe|trial|upgrade/.test(t)) return false;
  return /skip\s*(ad|ads)?\b|رد\s*(کردن|تبلیغ)|عبور/.test(t);
}
function isSkipReady(el) {
  if (!el || isPremiumUpsell(el) || isCountdown(el)) return false;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
  return looksLikeSkip(el) || /ytp-skip-ad-button|ytp-ad-skip-button/.test(el.className || "");
}

import { JSDOM } from "jsdom";
let failed = 0;
for (const f of fixtures) {
  const dom = new JSDOM(f.html);
  const btn = dom.window.document.querySelector("button");
  const skip = isSkipReady(btn);
  const prem = isPremiumUpsell(btn);
  const ok = skip === f.expectSkip && prem === f.expectPremium;
  if (!ok) {
    failed += 1;
    console.error("FAIL", f.name, { skip, prem, expectSkip: f.expectSkip, expectPremium: f.expectPremium });
  } else console.log("PASS", f.name);
}
if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all skip fixture tests passed");
