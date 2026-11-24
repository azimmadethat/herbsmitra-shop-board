"use strict";
const DUMMY = document.createElement("div");
const $ = id => document.getElementById(id) || DUMMY;
const COPY = Object.assign({
  toastEmoji: ["", "🛍️", "🎁", "🎉", "🤑"],
  toastTitle: ["", "New order!", "Nice one!", "Big order!", "WHOA. Huge order!"],
  orderWord: ["order", "orders"],
}, window.BOARD_COPY || {});
const emit = (name, detail) => document.dispatchEvent(new CustomEvent("board:" + name, { detail }));
const API = location.origin;
// The board link carries ?k=<key>. Remember it so the remote's design switch keeps working.
const KEY = (() => {
  const k = new URLSearchParams(location.search).get("k");
  try { if (k) localStorage.setItem("boardKey", k); return k || localStorage.getItem("boardKey") || ""; } catch (e) { return k || ""; }
})();
const withKey = path => API + path + (path.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(KEY);
const TV = window.TVBridge || null;   // provided by the Android TV app
let state = null, shownRev = 0, insightIdx = 0;
let highestLiveRev = 0, highestLiveOrders = 0;

/* ---------- stage scaling + burn-in drift ---------- */
function fit() {
  const stage = $("stage");
  if (!stage || stage === DUMMY) return;
  // clientWidth, not innerWidth: Android TV WebViews report innerWidth before zoom.
  const W = document.documentElement.clientWidth || innerWidth, H = document.documentElement.clientHeight || innerHeight;
  if (W <= 900) {
    stage.style.transform = "";
    stage.style.transformOrigin = "";
    stage.style.left = "";
    stage.style.top = "";
    if (typeof fitVisibleChips === "function") fitVisibleChips();
    return;
  }
  // Ensure stage content is never vertically clipped on any screen or resolution
  const stageH = Math.max(1080, stage.scrollHeight || 1080);
  const s = Math.min(W / 1920, H / stageH);
  const t = Date.now() / 60000, dx = Math.sin(t) * 6, dy = Math.cos(t * .7) * 4;
  stage.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${s})`;
  stage.style.transformOrigin = "center";
  stage.style.left = "50%"; stage.style.top = "50%";
  if (typeof fitVisibleChips === "function") fitVisibleChips();
}
const isMobileStage = (document.documentElement.clientWidth || innerWidth) <= 900;
if ($("stage") && $("stage") !== DUMMY && !isMobileStage) $("stage").style.transform = "translate(-50%,-50%)";
addEventListener("resize", fit); addEventListener("load", fit); fit(); setTimeout(fit, 1500); setInterval(fit, 20000);

/* ---------- formatting ---------- */
const inr = v => Math.round(v).toLocaleString("en-IN");
function clock() {
  const d = new Date();
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  $("clock").innerHTML = `${day} · <b>${time}</b>`;
  const h = d.getHours();
  // Never force body.night or sleep dimming: keeps colors vivid and clear 24/7.
  $("zzz").setAttribute("opacity", "0");
}
clock(); setInterval(clock, 10000);

/* ---------- mascot hats ---------- */
const HATS = {
  party: `<path d="M80 40 L100 -4 L120 40 Z" fill="var(--accent)"/><circle cx="100" cy="-6" r="9" fill="var(--accent2)"/><path d="M86 30h28" stroke="#fff" stroke-width="5"/>`,
  shades: `<rect x="56" y="92" width="40" height="24" rx="10" fill="#1b1b1b"/><rect x="104" y="92" width="40" height="24" rx="10" fill="#1b1b1b"/><path d="M96 100h8" stroke="#1b1b1b" stroke-width="5"/>`,
  crown: `<path d="M66 42 L74 8 L90 30 L100 2 L110 30 L126 8 L134 42 Z" fill="#ffc400" stroke="#d99a00" stroke-width="3"/><circle cx="100" cy="28" r="5" fill="var(--accent)"/>`,
  flower: `<g transform="translate(140 48)"><circle r="10" cx="0" cy="-14" fill="#ff7eb3"/><circle r="10" cx="13" cy="-4" fill="#ff7eb3"/><circle r="10" cx="8" cy="12" fill="#ff7eb3"/><circle r="10" cx="-8" cy="12" fill="#ff7eb3"/><circle r="10" cx="-13" cy="-4" fill="#ff7eb3"/><circle r="8" fill="#ffd23f"/></g>`,
  headphones: `<path d="M34 110 Q34 20 100 20 Q166 20 166 110" stroke="var(--ink)" stroke-width="10" fill="none"/><rect x="20" y="96" width="26" height="44" rx="12" fill="var(--accent)"/><rect x="154" y="96" width="26" height="44" rx="12" fill="var(--accent)"/>`,
  bowtie: `<path d="M100 166 L74 152 L74 180 Z M100 166 L126 152 L126 180 Z" fill="var(--accent)"/><circle cx="100" cy="166" r="7" fill="var(--accent2)"/>`,
  none: ""
};
function mood(m) {
  if (!document.getElementById("mouth")) { emit("mood", m); return; }
  emit("mood", m);
  const mouths = {
    happy: "M84 134q16 16 32 0", grin: "M80 130q20 26 40 0z", meh: "M86 138h28",
    worried: "M84 142q16 -12 32 0", talk: "M90 134q10 14 20 0q-10 -6 -20 0z", o: "M94 136a6 7 0 1 0 12 0a6 7 0 1 0 -12 0"
  };
  const p = $("mouth"); p.setAttribute("d", mouths[m] || mouths.happy);
  p.setAttribute("fill", m === "grin" || m === "talk" || m === "o" ? "#2b1a0e" : "none");
}
function veeAnim(cls) { emit("cheer", cls); const v = $("vee"); v.classList.remove("hop", "party"); void v.offsetWidth; v.classList.add(cls); }

/* ---------- render ---------- */
function render(s) {
  state = s;
  document.querySelectorAll(".storename").forEach(el => { el.textContent = s.store_name || ""; });

  // Historical date banner
  if (s.is_past_date) {
    let banner = $("hist-banner");
    if (!banner || banner === DUMMY) {
      banner = document.createElement("div");
      banner.id = "hist-banner";
      banner.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(15,23,42,0.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.25);padding:8px 20px;border-radius:999px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,0.45);display:flex;align-items:center;gap:14px;";
      document.body.appendChild(banner);
    }
    banner.style.display = "flex";
    banner.innerHTML = `<span>📅 Viewing Orders for: <b>${esc(s.selected_date)}</b> (${s.orders} orders · ₹${inr(s.revenue)})</span><button id="hist-banner-best" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:999px;padding:4px 12px;font-weight:700;font-size:12px;cursor:pointer;">🏆 Best Days</button><button id="hist-banner-live" style="background:#22c55e;color:#052e16;border:none;border-radius:999px;padding:4px 14px;font-weight:700;font-size:12px;cursor:pointer;">Back to Live 🔴</button>`;
    const liveBtn = $("hist-banner-live");
    if (liveBtn) liveBtn.onclick = () => resetToLive();
    const bestBtn = $("hist-banner-best");
    if (bestBtn) bestBtn.onclick = () => openBestDaysCalendar();
  } else {
    const banner = $("hist-banner");
    if (banner && banner !== DUMMY) banner.style.display = "none";
  }

  if (s.daily) {
    document.body.dataset.theme = s.daily.theme;
    $("hat").innerHTML = HATS[s.daily.hat] || "";
    $("headline").textContent = s.daily.headline;
    $("subline").textContent = s.daily.subline;
  }
  if (!s.is_past_date) {
    if (s.revenue < highestLiveRev) s.revenue = highestLiveRev;
    else highestLiveRev = s.revenue;
    if (s.orders < highestLiveOrders) s.orders = highestLiveOrders;
    else highestLiveOrders = s.orders;
  }
  countTo(s.revenue);
  $("orders").textContent = s.orders;
  $("orderword").textContent = s.orders === 1 ? COPY.orderWord[0] : COPY.orderWord[1];
  $("aov").textContent = "₹" + inr(s.aov);
  const vs = $("vsy");
  const compLabel = s.is_yesterday === false ? "vs previous day by now" : "vs yesterday by now";
  if (s.vs_yesterday_pct !== null && s.vs_yesterday_pct !== undefined) {
    const p = s.vs_yesterday_pct; vs.hidden = false;
    vs.className = "pill " + (p >= 0 ? "up" : "down");
    vs.innerHTML = `${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}%<small style="color:inherit;opacity:.85">${compLabel}</small>`;
  } else if (s.revenue > 0) {
    vs.hidden = false;
    vs.className = "pill up";
    vs.innerHTML = `▲ 100%<small style="color:inherit;opacity:.85">${compLabel}</small>`;
  } else vs.hidden = true;

  // race: scale to the bigger of yesterday's total, projection and today
  if (s.yesterday_total || s.projection || s.revenue) {
    $("race").hidden = false;
    const yTot = s.yesterday_total || 0;
    const yBy = s.yesterday_by_now || 0;
    const max = Math.max(yTot, s.projection || 0, s.revenue, 1) * 1.08;
    const pct = v => Math.min(100, Math.max(0, (v || 0) / max * 100)) + "%";
    $("rfill").style.width = pct(s.revenue);
    const rEl = $("runner");
    rEl.style.left = pct(s.revenue);
    rEl.style.transform = "translate(-50%, -58%) scaleX(-1)";
    rEl.style.display = "inline-block";
    $("rmark").hidden = true;
    $("rmark").style.display = "none";
    $("rproj").hidden = true;
    $("rproj").style.display = "none";
    const byNowTxt = s.is_yesterday === false ? "Previous day by now" : "Yesterday by now";
    const allDayTxt = s.is_yesterday === false ? "Previous day all day" : "Yesterday all day";
    $("rleft").textContent = `${byNowTxt} ₹${inr(yBy)}`;
    $("rright").textContent = s.projection ? `Heading for ~₹${inr(s.projection)} · ${allDayTxt.toLowerCase()} ₹${inr(yTot)}` : `${allDayTxt} ₹${inr(yTot)}`;
  }

  // ads
  const be = s.break_even;
  const META_SUNRISE_ICON = '<img src="/meta-sunrise.png" alt="Meta" class="weather-ico" style="width:1.15em;height:1.15em;object-fit:contain;vertical-align:middle;display:inline-block;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.08));">';
  if (s.spend) {
    const r = s.roas_real, early = s.spend < 1500;
    $("roas").innerHTML = `${r.toFixed(2)}<small>x</small>`;
    $("weather").innerHTML = META_SUNRISE_ICON;
    $("roasnote").textContent = early ? "too early to tell, the day just started" : `real sales ÷ ad spend · break-even ${be}`;
    // Meta pulls run every 15 min; anything much older means the connection is down.
    if (s.meta_age_min !== null && s.meta_age_min > 40) {   // pulls run every 15 min
      const h = Math.floor(s.meta_age_min / 60), m = s.meta_age_min % 60;
      $("roasnote").textContent = `⚠️ ad numbers are ${h ? h + "h " : ""}${m}m old, Meta is reconnecting`;
    }
    $("spend").textContent = "₹" + inr(s.spend);
    $("mroas").textContent = s.roas_meta ? s.roas_meta.toFixed(2) + "x" : "-";
    mood(early ? "happy" : r >= be * 1.3 ? "grin" : r >= be ? "happy" : r >= be * .75 ? "meh" : "worried");
  } else {
    $("roas").innerHTML = "-"; $("weather").innerHTML = META_SUNRISE_ICON;
    $("roasnote").textContent = !s.meta_on ? "connect Meta ads to see ad numbers here"
      : s.meta_error ? "⚠️ Meta isn't answering: ask your AI to check the Meta token"
      : "first ad numbers of the day are on their way";
    $("spend").textContent = "₹0"; $("mroas").textContent = "-";
    $("camps").innerHTML = '<div class="dim">No ad spend yet today.</div>';
  }
  if (s.spend && s.campaigns && s.campaigns.length) {
    const scale = 4;
    $("camps").innerHTML = s.campaigns.slice(0, window.CAMP_LIMIT || 5).map(c => {
      if (window.renderCampaign) return window.renderCampaign(c, be);
      const r = c.roas || 0, col = r >= be ? "var(--good)" : r >= be * .75 ? "var(--warn)" : "var(--bad)";
      return `<div class="camp"><span class="nm">${esc(c.short)}</span><span class="rv">${c.roas ? c.roas.toFixed(1) + "x" : "no sales yet"}</span>
        <div class="bar"><b style="width:${Math.min(100, r / scale * 100)}%;background:${col}"></b><span class="be" style="left:${be / scale * 100}%"></span></div>
        <div class="meta"><span>₹${inr(c.spend)} spent</span><span>${c.purchases} purchase${c.purchases === 1 ? "" : "s"} on Meta</span></div></div>`;
    }).join("") + (window.renderCampaign ? "" : `<div class="dim" style="font-size:20px">Meta numbers as of ${s.meta_at || "-"}, they refresh every 15 min</div>`);
  }

  // chips: leading chips for the top city and for cancelled/refunded/failed,
  // chips: leading chips for the top city and for cancelled/refunded/failed,
  // then the latest orders. The same row exists in all five designs.
  const chips = $("chips"), have = new Set([...chips.children].map(c => c.dataset.k));
  const want = [];
  if (s.cities && s.cities.length) {
    const top = s.cities[0];
    const second = s.cities[1] ? ` · ${esc(s.cities[1].city)} ${s.cities[1].orders}` : "";
    want.push({ k: "city:" + s.cities.map(c => c.city + c.orders).join(","), cls: "chip",
      html: `📍 <b>People from ${esc(top.city)}</b> have ordered ${top.orders} time${top.orders === 1 ? "" : "s"} today${second}` });
  }
  const rj = s.rejected;
  const bad = rj ? rj.cancelled.orders + rj.refunded.orders + rj.failed.orders : 0;
  if (rj && bad > 0) {
    want.push({ k: `rej:${rj.cancelled.orders}/${rj.refunded.orders}/${rj.failed.orders}`, cls: "chip",
      html: `✖ ${rj.cancelled.orders} cancelled · ${rj.refunded.orders} refunded · ${rj.failed.orders} failed` });
  }
  const recentOrders = s.recent || [];
  // Prioritize showing full order details without middle cut-offs; limit to top 3 candidates so 2-3 fit cleanly
  recentOrders.slice(0, 3).forEach(o => {
    const itm = itemsText(o);
    want.push({
      k: o.name + o.at, cls: "chip t" + o.tier,
      html: window.renderChip ? window.renderChip(o) : `${o.first ? "<b>" + esc(o.first) + "</b> · " : ""}${o.at} · <b>${esc(itm)}</b>${o.city ? " · " + esc(o.city) : ""} · ₹${inr(o.amount)}`,
    });
  });

  renderChips(want, have);
}

let lastWant = null, lastHave = null;
function fitVisibleChips() {
  const chips = $("chips");
  if (!chips || !chips.children.length) return;
  if ((document.documentElement.clientWidth || innerWidth) <= 900) return;
  const maxW = chips.clientWidth;
  if (!maxW || maxW <= 50) return;

  // Guarantee no chip ever gets cut off in the middle:
  // As long as scrollWidth exceeds container clientWidth (with 6px safety margin),
  // remove the last chip until all remaining chips fit 100% cleanly with plenty of room!
  while (chips.children.length > 1 && chips.scrollWidth > (maxW - 6)) {
    chips.lastElementChild.remove();
  }
}
window.fitVisibleChips = fitVisibleChips;

function renderChips(want, have) {
  const chips = $("chips");
  if (!chips) return;
  lastWant = want;
  lastHave = have;
  const wantKeyStr = want.map(w => w.k).join();
  if (chips.dataset.renderedKeys !== wantKeyStr) {
    chips.dataset.renderedKeys = wantKeyStr;
    chips.innerHTML = "";
    want.forEach(w => {
      const el = document.createElement("span");
      el.className = w.cls; el.dataset.k = w.k;
      if (have && have.has(el.dataset.k)) el.style.animation = "none";
      el.innerHTML = w.html;
      chips.appendChild(el);
    });
    fitVisibleChips();
    requestAnimationFrame(fitVisibleChips);
    setTimeout(fitVisibleChips, 50);
    setTimeout(fitVisibleChips, 150);
  }
}

if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => fitVisibleChips()).catch(() => {});
}
try {
  const ro = new ResizeObserver(() => fitVisibleChips());
  const cEl = $("chips");
  if (cEl && cEl !== DUMMY) ro.observe(cEl);
} catch {}

// Instant paint from local storage so the board renders with full data in 0ms without waiting to connect
(function restoreCachedState() {
  try {
    const raw = localStorage.getItem("shopboard_last_state");
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.revenue !== undefined) {
        render(cached);
        const live = $("live");
        if (live) live.classList.remove("off");
        const lt = $("livetxt");
        if (lt) lt.textContent = "live";
      }
    }
  } catch {}
})();
function itemsText(o) {
  return o.items.map(i => i.name + (i.qty > 1 ? " ×" + i.qty : "")).join(" + ");
}
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function countTo(target) {
  if (!state || !state.is_past_date) {
    if (target < highestLiveRev) target = highestLiveRev;
    else highestLiveRev = target;
  }
  if (target === shownRev) return;
  const from = shownRev, start = performance.now(), dur = from === 0 ? 1600 : 1100;
  if (from !== 0 && target > from) { const r = $("rev"); r.classList.remove("bump"); void r.offsetWidth; r.classList.add("bump"); }
  shownRev = target;
  (function step(t) {
    const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
    $("revnum").textContent = inr(from + (target - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(start);
}

/* ---------- rotating insights ---------- */
function nextInsight() {
  if (!state || !state.insights || !state.insights.length) return;
  // weighted: important lines come up more often
  const pool = [];
  state.insights.forEach((x, i) => { for (let k = 0; k < x.w; k++) pool.push(i); });
  let i = pool[Math.floor(Math.random() * pool.length)];
  if (state.insights.length > 1 && i === insightIdx) i = (i + 1) % state.insights.length;
  insightIdx = i;
  say(state.insights[i].emoji, state.insights[i].text);
}
function say(emo, text, isAnswer, q) {
  const t = $("itext");
  t.classList.add("out");
  setTimeout(() => {
    $("emo").textContent = emo;
    $("bubble").classList.toggle("answer", !!isAnswer);
    t.innerHTML = (q ? `<span class="q">“${esc(q)}”</span>` : "") + esc(text);
    t.classList.remove("out");
    emit("say", { emo, text, isAnswer: !!isAnswer, q });
  }, 400);
}
setInterval(nextInsight, 12000);

/* ---------- sound engine (rich e-commerce sounds: Cha-Ching, Bell, Celebration) ---------- */
let ac = null;
function audio() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  return ac;
}

let orderChimeBuffer = null;
let orderAudioElement = null;

function initOrderAudio() {
  try {
    if (!orderAudioElement) {
      orderAudioElement = new Audio("/order-chime.mp3");
      orderAudioElement.preload = "auto";
    }
  } catch {}

  try {
    fetch("/order-chime.mp3")
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then(buf => {
        const a = audio();
        return a.decodeAudioData(buf);
      })
      .then(decoded => {
        orderChimeBuffer = decoded;
      })
      .catch(() => {});
  } catch {}
}
initOrderAudio();

try { localStorage.removeItem("boardSoundStyle"); } catch {}
window.SOUND_STYLE = "custom";

function chime(tier = 1) {
  try {
    const a = audio();
    if (a && a.state === "suspended") a.resume();

    // Exclusively play the user's uploaded order notification sound
    if (orderChimeBuffer && a) {
      const src = a.createBufferSource();
      src.buffer = orderChimeBuffer;
      const gain = a.createGain();
      gain.gain.value = 1.0;
      src.connect(gain);
      gain.connect(a.destination);
      src.start(0);
      return;
    }

    if (orderAudioElement) {
      const clone = orderAudioElement.cloneNode();
      clone.currentTime = 0;
      clone.play().catch(() => {});
      return;
    }

    const direct = new Audio("/order-chime.mp3");
    direct.play().catch(() => {});
  } catch (e) {
    console.warn("Audio chime error:", e);
  }
}
window.playTestSound = function() {
  chime(2);
};
function fanfare() {
  chime(4);
  setTimeout(() => chime(3), 900);
}

function needUnlock() {
  if (TV) return;
  const a = audio();
  if (a.state === "suspended") $("unlock").classList.add("show");
}
$("unlock").onclick = () => {
  const a = audio();
  if (a) a.resume();
  initOrderAudio();
  $("unlock").classList.remove("show");
  chime(1);
};

/* ---------- order + milestone moments ---------- */
const toastQ = []; let toasting = false;
function onOrder(o) { toastQ.push(o); if (!toasting) showToast(); }
function showToast() {
  const o = toastQ.shift(); if (!o) { toasting = false; return; }
  toasting = true;
  const t = $("toast");
  t.className = "t" + o.tier;
  $("tbig").textContent = COPY.toastEmoji[o.tier];
  $("th").textContent = COPY.toastTitle[o.tier];
  emit("order", o);
  $("tp").textContent = (o.first ? "From " + o.first : "New order") + " · " + itemsText(o) + (o.city ? " · " + o.city : "") + (o.new ? " · 🌱 new customer" : "");
  $("tamt").textContent = "₹" + inr(o.amount);
  void t.offsetWidth; t.classList.add("show");
  chime(o.tier);
  veeAnim(o.tier >= 3 ? "party" : "hop");
  mood("grin");
  if (o.tier >= 3) confetti(o.tier === 4 ? 260 : 140);
  // Notification displays for 2.6 seconds (2-3 sec) then smoothly slides away
  setTimeout(() => { t.classList.remove("show"); setTimeout(showToast, 400); }, 2600);
}
function onMilestone(m) {
  $("mh").textContent = m.label;
  emit("milestone", m);
  $("milestone").classList.add("show");
  fanfare(); confetti(400); veeAnim("party");
  setTimeout(() => $("milestone").classList.remove("show"), 6500);
}

/* ---------- confetti ---------- */
const cv = $("confetti"), cx = cv.getContext("2d"); let bits = [];
function confetti(n) {
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = window.CONFETTI || ["#ff7a1a", "#ffb800", "#e5197a", "#3cc5a8", "#6a4cff", "#ffffff"];
  for (let i = 0; i < n; i++) bits.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .5,
    vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4, r: Math.random() * 6.3, vr: (Math.random() - .5) * .3,
    w: 8 + Math.random() * 10, h: 5 + Math.random() * 6, c: cols[i % cols.length] });
  if (bits.length === n) requestAnimationFrame(drawBits);
}
function drawBits() {
  cx.clearRect(0, 0, cv.width, cv.height);
  bits.forEach(b => { b.x += b.vx; b.y += b.vy; b.vy += .05; b.r += b.vr;
    cx.save(); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c; cx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); cx.restore(); });
  bits = bits.filter(b => b.y < cv.height + 30);
  if (bits.length) requestAnimationFrame(drawBits); else cx.clearRect(0, 0, cv.width, cv.height);
}

/* ---------- voice feature disabled ---------- */
function stopVoice() {}
function listen() {}
function triggerTestOrder() {
  const tiers = [
    { a: 796, tier: 2, item: "HerbsMitra Joint Care Oil ×2" },
    { a: 1194, tier: 3, item: "HerbsMitra Pain Relief Spray ×3" },
    { a: 2388, tier: 4, item: "HerbsMitra Complete Relief Combo" }
  ];
  const pick = tiers[Math.floor(Math.random() * tiers.length)];
  const cities = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Jaipur", "Hyderabad", "Ahmedabad", "Chandigarh"];
  const names = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Ananya", "Rohan", "Pooja"];
  const city = cities[Math.floor(Math.random() * cities.length)];
  const first = names[Math.floor(Math.random() * names.length)];

  onOrder({
    name: "#TEST" + Math.floor(1000 + Math.random() * 9000),
    at: new Date().toTimeString().slice(0, 5),
    amount: pick.a,
    city: city,
    first: first,
    items: [{ name: pick.item, qty: 1 }],
    units: 1,
    tier: pick.tier,
    new: Math.random() > 0.4
  });
}
window.triggerTestOrder = triggerTestOrder;

addEventListener("keydown", e => {
  // "t" plays a pretend order, to check the sound and the animation.
  if (e.key === "t" || e.key === "T") { triggerTestOrder(); }
  // "b" opens the Best Days Calendar.
  if (e.key === "b" || e.key === "B") { openBestDaysCalendar(); }
  // Left and right on the TV remote flip through the designs.
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const i = DESIGNS.indexOf(window.DESIGN), next = DESIGNS[(i + (e.key === "ArrowRight" ? 1 : DESIGNS.length - 1)) % DESIGNS.length];
    document.cookie = "design=" + next + "; path=/; max-age=31536000; SameSite=Lax";
    location.href = API + "/?design=" + next + (KEY ? "&k=" + encodeURIComponent(KEY) : "");
  }
});
const DESIGNS = ["classic", "meta", "apple", "studio", "swiss"];

/* ---------- live connection + date selection ---------- */
// Asks the server for fresh numbers every 20 seconds (or for the chosen historical date).
let seenIds = null;
window.SELECTED_DATE = null;
let pollTimer = null;

function resetToLive() {
  window.SELECTED_DATE = null;
  const dateInput = document.getElementById("hud-date");
  if (dateInput) dateInput.value = "";
  const liveBtn = document.getElementById("hud-live-btn");
  if (liveBtn) liveBtn.style.display = "none";
  const banner = document.getElementById("hist-banner");
  if (banner) banner.style.display = "none";
  if (pollTimer) clearTimeout(pollTimer);
  poll();
}
window.resetToLive = resetToLive;

async function poll() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  try {
    const endpoint = window.SELECTED_DATE ? `/api/state?date=${encodeURIComponent(window.SELECTED_DATE)}` : "/api/state";
    const r = await fetch(withKey(endpoint), { cache: "no-store" });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || "HTTP " + r.status);
    $("live").classList.remove("off");
    $("livetxt").textContent = window.SELECTED_DATE ? "archive" : "live";
    const fresh = seenIds && !window.SELECTED_DATE ? s.order_ids.filter(id => !seenIds.has(id)) : [];
    const prevRev = state ? state.revenue : null;
    seenIds = new Set(s.order_ids);
    render(s); emit("state", s);
    try { if (!window.SELECTED_DATE) localStorage.setItem("shopboard_last_state", JSON.stringify(s)); } catch {}
    if (!window._said) { window._said = 1; nextInsight(); }
    if (!window.SELECTED_DATE) {
      (s.recent || []).filter(o => fresh.includes(o.name)).reverse().forEach(onOrder);
      if (prevRev !== null) {
        const crossed = (s.milestones || []).filter(m => prevRev < m && s.revenue >= m).pop();
        if (crossed) onMilestone({ amount: crossed, label: "₹" + inr(crossed) });
      }
    }
  } catch (e) {
    $("live").classList.add("off"); $("livetxt").textContent = "reconnecting";
    if (!state) say("🔌", "Can't load the numbers: " + e.message);
  }
  pollTimer = setTimeout(poll, window.SELECTED_DATE ? 60000 : 20000);
}
poll();
setTimeout(needUnlock, 800);

/* ---------- today vs yesterday curve, for designs that draw a chart ---------- */
// Returns SVG path strings scaled to w x h. Yesterday is all 24 hours; today ends at "now".
window.curvePaths = (s, w, h) => {
  const c = s.curve; if (!c) return null;
  const d = new Date(), nowH = d.getHours() + d.getMinutes() / 60;
  const max = Math.max(c.yesterday[23] || 0, s.projection || 0, s.revenue || 0, 1) * 1.08;
  const X = hr => hr / 24 * w, Y = v => h - v / max * h;
  const line = pts => pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const yPts = [[0, 0]].concat(c.yesterday.map((v, i) => [i + 1, v]));
  const tPts = [[0, 0]].concat(c.today.map((v, i) => [Math.min(i + 1, nowH), v]));
  const last = tPts[tPts.length - 1];
  return {
    today: line(tPts), yesterday: line(yPts),
    todayArea: line(tPts) + ` L${X(last[0]).toFixed(1)} ${h} L0 ${h} Z`,
    dot: [X(last[0]), Y(last[1])], max,
    projY: s.projection ? Y(s.projection) : null, yNowY: Y(s.yesterday_by_now || 0),
    X, Y
  };
};

/* ---------- Best Days & Order History Calendar View ---------- */
let curCalYear = new Date().getFullYear();
let curCalMonth = new Date().getMonth();
let curCalSort = "orders";

function closeBestDaysCalendar() {
  const modal = document.getElementById("best-days-modal");
  if (modal) modal.classList.remove("open");
}

function openBestDaysCalendar(onSelectDate) {
  const handler = onSelectDate || (d => {
    window.SELECTED_DATE = d;
    const hudDate = document.getElementById("hud-date");
    if (hudDate) hudDate.value = d;
    const hudLive = document.getElementById("hud-live-btn");
    if (hudLive) hudLive.style.display = "inline-flex";
    if (typeof poll === "function") poll();
  });

  let modal = document.getElementById("best-days-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "best-days-modal";
    modal.innerHTML = `
      <style>
        #best-days-modal {
          position: fixed;
          inset: 0;
          z-index: 100000;
          background: rgba(15, 23, 42, 0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s ease;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
          color: #0f172a;
        }
        #best-days-modal.open {
          opacity: 1;
          pointer-events: auto;
        }
        .bdm-box {
          background: #ffffff;
          width: 100%;
          max-width: 940px;
          max-height: 90vh;
          overflow-y: auto;
          border-radius: 20px;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          animation: bdmSlide .28s cubic-bezier(.16,1,.3,1);
        }
        @keyframes bdmSlide {
          from { transform: translateY(20px) scale(0.97); }
          to { transform: translateY(0) scale(1); }
        }
        .bdm-header {
          padding: 18px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border-radius: 20px 20px 0 0;
        }
        .bdm-title {
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bdm-close {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid #cbd5e1;
          background: #fff;
          cursor: pointer;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          transition: all .15s ease;
        }
        .bdm-close:hover {
          background: #fee2e2;
          border-color: #f87171;
          color: #dc2626;
        }
        .bdm-content {
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .bdm-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .bdm-sort-toggle {
          display: inline-flex;
          background: #f1f5f9;
          border-radius: 999px;
          padding: 3px;
          border: 1px solid #e2e8f0;
        }
        .bdm-sort-btn {
          border: none;
          background: transparent;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          transition: all .15s ease;
        }
        .bdm-sort-btn.active {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(37,99,235,0.25);
        }
        .bdm-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
        }
        .bdm-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px 16px;
          cursor: pointer;
          transition: all .18s ease;
          position: relative;
          overflow: hidden;
        }
        .bdm-card:hover {
          background: #eff6ff;
          border-color: #93c5fd;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(37,99,235,0.12);
        }
        .bdm-card.rank-1 { border-left: 5px solid #f59e0b; background: #fffdf5; }
        .bdm-card.rank-2 { border-left: 5px solid #94a3b8; background: #f8fafc; }
        .bdm-card.rank-3 { border-left: 5px solid #d97706; background: #fffaf0; }
        .bdm-card .rank-badge {
          position: absolute;
          top: 10px;
          right: 12px;
          font-size: 20px;
        }
        .bdm-card .c-date {
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
        }
        .bdm-card .c-main {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin-top: 4px;
          letter-spacing: -.5px;
        }
        .bdm-card .c-sub {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
          margin-top: 2px;
        }
        .bdm-cal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 4px;
        }
        .bdm-month-title {
          font-size: 16px;
          font-weight: 800;
          color: #1e293b;
        }
        .bdm-nav-btn {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          color: #334155;
          transition: background .15s;
        }
        .bdm-nav-btn:hover { background: #e2e8f0; }
        .bdm-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }
        .bdm-day-head {
          text-align: center;
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          padding: 6px 0;
        }
        .bdm-day-cell {
          aspect-ratio: 1 / 0.95;
          min-height: 68px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: #ffffff;
          cursor: pointer;
          transition: all .15s ease;
          position: relative;
        }
        .bdm-day-cell.empty {
          background: #fafafa;
          border-color: #f1f5f9;
          cursor: default;
        }
        .bdm-day-cell:not(.empty):hover {
          border-color: #2563eb;
          box-shadow: 0 4px 12px rgba(37,99,235,0.18);
          transform: scale(1.02);
          z-index: 2;
        }
        .bdm-day-cell.is-today {
          border: 2px solid #2563eb;
          background: #eff6ff;
        }
        .bdm-day-cell.is-selected {
          border: 2px solid #16a34a;
          background: #f0fdf4;
        }
        .bdm-day-num {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .bdm-day-orders {
          font-size: 11px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 6px;
          background: #f1f5f9;
          color: #0f172a;
          display: inline-block;
          margin-top: 2px;
          width: fit-content;
        }
        .bdm-day-orders.high {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .bdm-day-orders.top {
          background: #fef3c7;
          color: #b45309;
        }
        .bdm-day-rev {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          font-variant-numeric: tabular-nums;
        }
      </style>
      <div class="bdm-box">
        <div class="bdm-header">
          <div class="bdm-title">
            <span>🏆 Best Days as per Orders & Order History</span>
          </div>
          <button class="bdm-close" id="bdm-close-btn" title="Close (Esc)">✕</button>
        </div>
        <div class="bdm-content">
          <div class="bdm-top-bar">
            <div>
              <span style="font-size:12px;color:#64748b;font-weight:600;margin-right:6px;">Rank days by:</span>
              <div class="bdm-sort-toggle">
                <button class="bdm-sort-btn active" id="bdm-by-orders">📦 Highest Orders</button>
                <button class="bdm-sort-btn" id="bdm-by-rev">💰 Highest Sales</button>
              </div>
            </div>
            <button class="btn btn-primary" id="bdm-today-btn" style="padding:6px 14px;font-size:12px;background:#16a34a;border:none;border-radius:999px;color:#fff;font-weight:700;cursor:pointer;">🔴 Live Today</button>
          </div>

          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin-bottom:8px;">🌟 Best Days Leaderboard</div>
            <div class="bdm-cards" id="bdm-leaderboard"></div>
          </div>

          <div style="border-top:1px solid #e2e8f0;padding-top:14px;">
            <div class="bdm-cal-header">
              <button class="bdm-nav-btn" id="bdm-prev-month">◀ Prev Month</button>
              <div class="bdm-month-title" id="bdm-month-title"></div>
              <button class="bdm-nav-btn" id="bdm-next-month">Next Month ▶</button>
            </div>
            <div class="bdm-grid" id="bdm-grid-head">
              <div class="bdm-day-head">Sun</div>
              <div class="bdm-day-head">Mon</div>
              <div class="bdm-day-head">Tue</div>
              <div class="bdm-day-head">Wed</div>
              <div class="bdm-day-head">Thu</div>
              <div class="bdm-day-head">Fri</div>
              <div class="bdm-day-head">Sat</div>
            </div>
            <div class="bdm-grid" id="bdm-grid-cells" style="margin-top:6px;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => {
      if (e.target === modal) closeBestDaysCalendar();
    });
    document.getElementById("bdm-close-btn").addEventListener("click", closeBestDaysCalendar);

    document.getElementById("bdm-by-orders").addEventListener("click", () => {
      curCalSort = "orders";
      document.getElementById("bdm-by-orders").classList.add("active");
      document.getElementById("bdm-by-rev").classList.remove("active");
      renderCalendarModalContent(handler);
    });

    document.getElementById("bdm-by-rev").addEventListener("click", () => {
      curCalSort = "revenue";
      document.getElementById("bdm-by-rev").classList.add("active");
      document.getElementById("bdm-by-orders").classList.remove("active");
      renderCalendarModalContent(handler);
    });

    document.getElementById("bdm-prev-month").addEventListener("click", () => {
      curCalMonth--;
      if (curCalMonth < 0) { curCalMonth = 11; curCalYear--; }
      renderCalendarModalContent(handler);
    });

    document.getElementById("bdm-next-month").addEventListener("click", () => {
      curCalMonth++;
      if (curCalMonth > 11) { curCalMonth = 0; curCalYear++; }
      renderCalendarModalContent(handler);
    });

    document.getElementById("bdm-today-btn").addEventListener("click", () => {
      closeBestDaysCalendar();
      if (typeof resetToLive === "function") resetToLive();
      else handler(null);
    });
  }

  modal.classList.add("open");
  renderCalendarModalContent(handler);
}

function renderCalendarModalContent(onSelectDate) {
  const s = state || {};
  let list = s.daily_history || [];

  if (!list.length) {
    if (s.selected_date) list.push({ date: s.selected_date, orders: s.orders || 0, revenue: s.revenue || 0 });
    if (s.yesterday_total) {
      const yDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      list.push({ date: yDate, orders: Math.round(s.yesterday_total / (s.aov || 440)), revenue: s.yesterday_total });
    }
  }

  const byDate = {};
  list.forEach(d => { byDate[d.date] = d; });

  const sortedList = [...list].sort((a, b) => {
    return curCalSort === "orders" ? (b.orders - a.orders || b.revenue - a.revenue) : (b.revenue - a.revenue || b.orders - a.orders);
  });

  const ranks = {};
  sortedList.forEach((d, idx) => { ranks[d.date] = idx + 1; });

  // Render Top 3 Leaderboard
  const top3 = sortedList.slice(0, 3);
  const lb = document.getElementById("bdm-leaderboard");
  if (lb) {
    lb.innerHTML = top3.map((d, i) => {
      const rankNum = i + 1;
      const medal = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : "🥉";
      const dateFmt = new Date(d.date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      const mainVal = curCalSort === "orders" ? `${d.orders} orders` : `₹${inr(d.revenue)}`;
      const subVal = curCalSort === "orders" ? `₹${inr(d.revenue)} revenue` : `${d.orders} orders`;
      return `
        <div class="bdm-card rank-${rankNum}" data-date="${d.date}">
          <span class="rank-badge">${medal}</span>
          <div class="c-date">Rank #${rankNum} · ${dateFmt}</div>
          <div class="c-main">${mainVal}</div>
          <div class="c-sub">${subVal}</div>
        </div>
      `;
    }).join("");

    lb.querySelectorAll(".bdm-card").forEach(el => {
      el.addEventListener("click", () => {
        const dt = el.dataset.date;
        closeBestDaysCalendar();
        onSelectDate(dt);
        chime(2);
      });
    });
  }

  // Render Calendar Grid
  const mTitle = document.getElementById("bdm-month-title");
  if (mTitle) {
    mTitle.textContent = new Date(curCalYear, curCalMonth, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }

  const gridCells = document.getElementById("bdm-grid-cells");
  if (gridCells) {
    const firstDay = new Date(curCalYear, curCalMonth, 1).getDay();
    const totalDays = new Date(curCalYear, curCalMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);
    const selectedDateStr = window.SELECTED_DATE || (typeof selectedDate !== "undefined" ? selectedDate : null);

    let html = "";
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="bdm-day-cell empty"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const dStr = `${curCalYear}-${String(curCalMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const item = byDate[dStr];
      const rank = ranks[dStr];
      const isToday = dStr === todayStr;
      const isSel = dStr === selectedDateStr;
      const rankIcon = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";

      let ordersHtml = "";
      let revHtml = "";
      if (item && item.orders > 0) {
        const isTop = rank && rank <= 3;
        const isHigh = rank && rank <= 7;
        ordersHtml = `<div class="bdm-day-orders ${isTop ? 'top' : isHigh ? 'high' : ''}">${item.orders} orders</div>`;
        revHtml = `<div class="bdm-day-rev">₹${inr(item.revenue)}</div>`;
      } else {
        ordersHtml = `<div style="font-size:11px;color:#94a3b8;">–</div>`;
      }

      html += `
        <div class="bdm-day-cell ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''}" data-date="${dStr}">
          <div class="bdm-day-num">
            <span>${day} ${isToday ? '<small style="color:#2563eb;font-size:10px;">TODAY</small>' : ''}</span>
            <span>${rankIcon}</span>
          </div>
          ${ordersHtml}
          ${revHtml}
        </div>
      `;
    }

    gridCells.innerHTML = html;

    gridCells.querySelectorAll(".bdm-day-cell:not(.empty)").forEach(cell => {
      cell.addEventListener("click", () => {
        const dt = cell.dataset.date;
        closeBestDaysCalendar();
        onSelectDate(dt);
        chime(1);
      });
    });
  }
}
window.openBestDaysCalendar = openBestDaysCalendar;
window.closeBestDaysCalendar = closeBestDaysCalendar;

// Ensure Top Ops button exists and has correct key link across all themes
function initTopOps() {
  const opsUrl = "/ops.html" + (KEY ? "?k=" + encodeURIComponent(KEY) : "");
  let btn = document.getElementById("top-ops-btn");
  if (btn) {
    btn.href = opsUrl;
  } else {
    const live = $("live");
    if (live && live.parentElement) {
      btn = document.createElement("a");
      btn.id = "top-ops-btn";
      btn.href = opsUrl;
      btn.className = "top-ops-btn";
      btn.title = "Quickly open Operations & All Orders Dashboard";
      btn.innerHTML = `<span style="font-size:18px;">📋</span> Ops Board`;
      btn.style.cssText = "display:inline-flex;align-items:center;gap:8px;padding:8px 22px;border-radius:999px;background:rgba(255,255,255,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,0.12);color:inherit;text-decoration:none;font-size:19px;font-weight:700;margin-right:16px;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,0.08);transition:all 0.2s ease;white-space:nowrap;line-height:1;";
      btn.onmouseenter = () => { btn.style.transform = "translateY(-2px)"; btn.style.boxShadow = "0 6px 18px rgba(0,0,0,0.16)"; };
      btn.onmouseleave = () => { btn.style.transform = "translateY(0)"; btn.style.boxShadow = "0 3px 12px rgba(0,0,0,0.08)"; };
      live.parentElement.insertBefore(btn, live);
    }
  }
}

/* ---------- HUD quick control menu (compact collapsed trigger + expandable sleek drawer) ---------- */
function initHUD() {
  if (document.getElementById("board-hud")) return;
  const hud = document.createElement("aside");
  hud.id = "board-hud";
  hud.innerHTML = `
    <style>
      #board-hud {
        position: fixed;
        bottom: 22px;
        right: 26px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
        user-select: none;
      }
      #hud-trigger {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.82);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        color: #f8fafc;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        opacity: 0.85;
        transition: all 0.25s ease;
      }
      #hud-trigger:hover, #board-hud.open #hud-trigger {
        opacity: 1 !important;
        transform: scale(1.04);
        background: rgba(15, 23, 42, 0.94);
        border-color: rgba(255, 255, 255, 0.38);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
      }
      #board-hud.dimmed:not(.open) #hud-trigger {
        opacity: 0.28;
      }
      #hud-panel {
        position: absolute;
        bottom: 50px;
        right: 0;
        width: 330px;
        max-width: calc(100vw - 32px);
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 22px;
        padding: 16px 18px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        display: none;
        flex-direction: column;
        gap: 13px;
        color: #f8fafc;
        transform-origin: bottom right;
        animation: hudIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #board-hud.open #hud-panel {
        display: flex;
      }
      @keyframes hudIn {
        from { opacity: 0; transform: scale(0.92) translateY(12px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .hud-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .hud-title {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.3px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hud-close-x {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.65);
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
        border-radius: 6px;
      }
      .hud-close-x:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
      .hud-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .hud-lbl {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: rgba(255, 255, 255, 0.55);
      }
      .hud-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #board-hud select, .hud-input-date {
        appearance: none;
        -webkit-appearance: none;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        padding: 7px 12px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        outline: none;
        width: 100%;
        transition: all 0.15s;
      }
      #board-hud select:hover, .hud-input-date:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.3);
      }
      #board-hud select option {
        background: #0f172a;
        color: #fff;
      }
      .hud-act-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.09);
        color: #f8fafc;
        text-decoration: none;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .hud-act-btn:hover {
        background: rgba(255, 255, 255, 0.22);
        border-color: rgba(255, 255, 255, 0.35);
        color: #fff;
      }
      .hud-act-btn:active { transform: scale(0.97); }
      .hud-act-btn.gold {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        border-color: #b45309;
        color: #fff;
        font-weight: 700;
      }
      .hud-act-btn.gold:hover { filter: brightness(1.1); }
      .hud-act-btn.green {
        background: #22c55e;
        color: #052e16;
        font-weight: 700;
        border-color: #16a34a;
      }
      .hud-btn-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      @media (max-width: 640px) {
        #board-hud { bottom: 14px; right: 14px; }
        #hud-panel { width: 300px; }
      }
    </style>

    <div id="hud-trigger" title="Click to open Dashboard Menu & Controls (M)">
      <span>🌿</span>
      <span id="hud-trigger-text">Menu</span>
      <span style="font-size:11px;opacity:.7">⚙️</span>
    </div>

    <div id="hud-panel">
      <div class="hud-head">
        <div class="hud-title"><span>⚙️</span> Dashboard Controls</div>
        <button class="hud-close-x" id="hud-close-btn" title="Close menu (Esc)">✕</button>
      </div>

      <div class="hud-section">
        <div class="hud-lbl">Theme Design</div>
        <select id="hud-design-select" title="Switch Theme">
          <option value="classic">🥭 Classic</option>
          <option value="meta">🔷 Meta</option>
          <option value="apple">🍏 Apple</option>
          <option value="studio">💻 Studio</option>
          <option value="swiss">🇨🇭 Swiss</option>
        </select>
      </div>

      <div class="hud-section">
        <div class="hud-lbl">Date & Calendar</div>
        <div class="hud-input-row">
          <input type="date" id="hud-date" class="hud-input-date" style="color-scheme:dark;" title="Travel to any historical date">
          <button class="hud-act-btn gold" id="hud-best-btn" style="flex:none;" title="View Best Days as per orders in Calendar View">🏆 Best Days</button>
        </div>
        <button class="hud-act-btn green" id="hud-live-btn" style="display:none;width:100%;margin-top:2px;" title="Back to live today">🔴 Back to Live Today</button>
      </div>

      <div class="hud-section">
        <div class="hud-lbl">Order Sound SFX</div>
        <div class="hud-input-row">
          <div style="flex:1;font-size:12px;font-weight:700;color:#f8fafc;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.08);padding:7px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);">
            <span>🔔</span> Order Chime (Custom Audio)
          </div>
          <button class="hud-act-btn" id="hud-sound-test-btn" style="flex:none;" title="Audition your custom order notification sound">▶ Test</button>
        </div>
      </div>

      <div class="hud-section">
        <div class="hud-lbl">Quick Actions</div>
        <div class="hud-btn-grid">
          <a class="hud-act-btn" id="hud-ops-btn" href="/ops.html" title="Open All Orders Operations Dashboard">📋 OPS BOARD</a>
          <button class="hud-act-btn" id="hud-test-btn" title="Simulate a real order with sound & confetti (T)">🧪 Test Order</button>
          <button class="hud-act-btn" id="hud-sound-toggle-btn" title="Toggle sound status">🔊 Sound: On</button>
          <button class="hud-act-btn" id="hud-fs-btn" title="Toggle Fullscreen (F)">⛶ Fullscreen</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hud);

  const trigger = document.getElementById("hud-trigger");
  const panel = document.getElementById("hud-panel");
  const closeBtn = document.getElementById("hud-close-btn");

  function toggleMenu(e) {
    if (e) e.stopPropagation();
    const isOpen = hud.classList.toggle("open");
    if (isOpen) {
      hud.classList.remove("dimmed");
      clearTimeout(dimTimer);
    }
  }
  function closeMenu() {
    hud.classList.remove("open");
  }

  if (trigger) trigger.addEventListener("click", toggleMenu);
  if (closeBtn) closeBtn.addEventListener("click", e => { e.stopPropagation(); closeMenu(); });

  // Close when tapping outside
  document.addEventListener("click", e => {
    if (!hud.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMenu();
    if (e.key === "m" || e.key === "M") {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      toggleMenu();
    }
  });

  const sel = document.getElementById("hud-design-select");
  if (sel && window.DESIGN) sel.value = window.DESIGN;
  if (sel) {
    sel.addEventListener("change", e => {
      const next = e.target.value;
      document.cookie = "design=" + next + "; path=/; max-age=31536000; SameSite=Lax";
      location.href = API + "/?design=" + next + (KEY ? "&k=" + encodeURIComponent(KEY) : "");
    });
  }

  const hudDate = document.getElementById("hud-date");
  const hudLive = document.getElementById("hud-live-btn");
  if (hudDate) {
    const todayISO = new Date().toISOString().slice(0, 10);
    hudDate.max = todayISO;
    hudDate.addEventListener("change", e => {
      const val = e.target.value;
      if (!val || val === todayISO) {
        resetToLive();
      } else {
        window.SELECTED_DATE = val;
        if (hudLive) hudLive.style.display = "inline-flex";
        poll();
      }
    });
  }
  if (hudLive) {
    hudLive.addEventListener("click", () => {
      resetToLive();
      closeMenu();
    });
  }

  const hudBest = document.getElementById("hud-best-btn");
  if (hudBest) {
    hudBest.addEventListener("click", () => {
      closeMenu();
      openBestDaysCalendar();
    });
  }


  const soundTestBtn = document.getElementById("hud-sound-test-btn");
  if (soundTestBtn) {
    soundTestBtn.addEventListener("click", () => {
      const a = audio();
      if (a.state === "suspended") a.resume();
      chime(2);
    });
  }

  const soundToggleBtn = document.getElementById("hud-sound-toggle-btn");
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener("click", () => {
      const a = audio();
      if (a.state === "suspended") {
        a.resume().then(() => {
          soundToggleBtn.textContent = "🔊 Sound: On";
          if ($("unlock")) $("unlock").classList.remove("show");
          chime(1);
        });
      } else {
        chime(2);
      }
    });
  }

  const opsBtn = document.getElementById("hud-ops-btn");
  if (opsBtn) opsBtn.href = "/ops.html" + (KEY ? "?k=" + encodeURIComponent(KEY) : "");

  const testBtn = document.getElementById("hud-test-btn");
  if (testBtn) testBtn.addEventListener("click", () => {
    closeMenu();
    triggerTestOrder();
  });

  const fsBtn = document.getElementById("hud-fs-btn");
  if (fsBtn) {
    fsBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  let dimTimer = null;
  function resetDim() {
    if (hud.classList.contains("open")) return;
    hud.classList.remove("dimmed");
    clearTimeout(dimTimer);
    dimTimer = setTimeout(() => {
      if (!hud.classList.contains("open")) hud.classList.add("dimmed");
    }, 4500);
  }
  addEventListener("mousemove", resetDim);
  addEventListener("touchstart", resetDim, { passive: true });
  addEventListener("keydown", resetDim);
  resetDim();
}

function initAll() {
  initTopOps();
  initHUD();
}

if (document.readyState === "loading") {
  addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
