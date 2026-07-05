"use strict";

/* ============================================================
   N-Back — a quad n-back working-memory trainer.
   Four independent channels can be tracked at once:
     position  — which of 9 cells the square appears in
     number    — the digit shown in the square
     color     — the color the digit is tinted
     sound     — the spoken letter
   Each turn you press a channel's button if THIS turn's value
   matches the value from N turns ago.
   ============================================================ */

const CHANNELS = ["position", "number", "color", "sound"];
const LABELS = { position: "Position", number: "Number", color: "Color", sound: "Sound" };
const KEYS = { position: "a", number: "s", color: "d", sound: "f" };
// stable colors used for the progress-chart lines + legend
const LINE_COLORS = { total: "#8b95a5", position: "#4d8bf0", number: "#3bb273", color: "#e0a029", sound: "#9a6ade" };

const POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// 8 well-separated hues, bright enough to read on a dark square.
// (Dropped amber/teal/indigo — too close to orange/cyan/blue.)
const COLORS = [
  { name: "red", hex: "#ff5d5d" },
  { name: "orange", hex: "#ff9d3f" },
  { name: "yellow", hex: "#ffd43b" },
  { name: "green", hex: "#3ddc84" },
  { name: "cyan", hex: "#2fd0d6" },
  { name: "blue", hex: "#4d9bff" },
  { name: "purple", hex: "#b07bff" },
  { name: "white", hex: "#ffffff" },
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const NEUTRAL = "#4d5666"; // digit/square color when the color channel is off
const MATCH_RATE = 0.3;    // share of eligible turns that are a match, per channel

/* ---------- Settings (persisted) ---------- */
const DEFAULTS = {
  n: 2,
  channels: { position: true, number: true, color: true, sound: true },
  pace: 3000,
  trials: 20,
  adaptive: false,
  feedback: true,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("nback.settings") || "{}");
    return { ...DEFAULTS, ...saved, channels: { ...DEFAULTS.channels, ...(saved.channels || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function saveSettings() {
  localStorage.setItem("nback.settings", JSON.stringify(settings));
}

let settings = loadSettings();

/* ---------- DOM ---------- */
const $ = (sel) => document.querySelector(sel);
const screens = { home: $("#home"), game: $("#game"), results: $("#results"), history: $("#history"), howto: $("#howto") };
function show(name) {
  for (const key in screens) screens[key].classList.toggle("hidden", key !== name);
}

/* ============================================================
   HOME SCREEN
   ============================================================ */
function renderHome() {
  $("#nValue").textContent = settings.n;
  $("#tValue").textContent = settings.trials;
  document.querySelectorAll("#channelChips .chip").forEach((c) => {
    c.classList.toggle("active", settings.channels[c.dataset.channel]);
  });
  document.querySelectorAll("#paceChips .chip").forEach((c) => {
    c.classList.toggle("active", Number(c.dataset.pace) === settings.pace);
  });
  $("#adaptiveToggle").dataset.on = String(settings.adaptive);
  $("#feedbackToggle").dataset.on = String(settings.feedback);
  renderBest();
}

function renderBest() {
  const best = getBest(settings.n);
  $("#bestLine").textContent = best != null ? `Best at N=${settings.n}: ${best}%` : "";
}

function activeChannels() {
  return CHANNELS.filter((c) => settings.channels[c]);
}

function bindHome() {
  $("[data-n-dec]").onclick = () => { settings.n = Math.max(1, settings.n - 1); saveSettings(); renderHome(); };
  $("[data-n-inc]").onclick = () => { settings.n = Math.min(9, settings.n + 1); saveSettings(); renderHome(); };
  $("[data-t-dec]").onclick = () => { settings.trials = Math.max(10, settings.trials - 5); saveSettings(); renderHome(); };
  $("[data-t-inc]").onclick = () => { settings.trials = Math.min(50, settings.trials + 5); saveSettings(); renderHome(); };

  document.querySelectorAll("#channelChips .chip").forEach((c) => {
    c.onclick = () => {
      const ch = c.dataset.channel;
      const next = !settings.channels[ch];
      if (!next && activeChannels().length === 1) return; // keep at least one channel on
      settings.channels[ch] = next;
      saveSettings();
      renderHome();
    };
  });
  document.querySelectorAll("#paceChips .chip").forEach((c) => {
    c.onclick = () => { settings.pace = Number(c.dataset.pace); saveSettings(); renderHome(); };
  });
  $("#adaptiveToggle").onclick = () => { settings.adaptive = !settings.adaptive; saveSettings(); renderHome(); };
  $("#feedbackToggle").onclick = () => { settings.feedback = !settings.feedback; saveSettings(); renderHome(); };
  $("#startBtn").onclick = startGame;
}

/* ============================================================
   SEQUENCE GENERATION
   Build the whole block up front so every active channel is
   guaranteed at least a few N-back repetitions — there is never
   a block where a dimension has nothing to catch.
   ============================================================ */
function poolFor(ch) {
  if (ch === "position") return POSITIONS;
  if (ch === "number") return DIGITS;
  if (ch === "color") return COLORS.map((c) => c.name);
  return LETTERS;
}
function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sample(arr, k) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

function buildSequence(total, n, chans) {
  const seq = Array.from({ length: total }, () => ({}));
  for (const ch of chans) {
    const pool = poolFor(ch);
    const eligible = [];
    for (let i = n; i < total; i++) eligible.push(i);
    // guarantee at least one match; aim for ~MATCH_RATE of eligible turns
    const targetCount = Math.max(1, Math.round(eligible.length * MATCH_RATE));
    const targets = new Set(sample(eligible, Math.min(targetCount, eligible.length)));
    for (let i = 0; i < total; i++) {
      if (targets.has(i)) {
        seq[i][ch] = seq[i - n][ch]; // deliberate N-back match
      } else {
        const back = i >= n ? seq[i - n][ch] : null;
        let v;
        do { v = randOf(pool); } while (back != null && v === back && pool.length > 1);
        seq[i][ch] = v; // deliberately NOT a match
      }
    }
  }
  return seq;
}

/* ============================================================
   GAME
   ============================================================ */
let game = null;
let voice = null;
let nChange = null; // set when Adaptive N shifts the level, so results can announce it

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(letter) {
  if (!("speechSynthesis" in window)) return;
  // iOS reads an uppercase single letter as "capital A" — lowercase says just the letter name
  const u = new SpeechSynthesisUtterance(String(letter).toLowerCase());
  if (voice) u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

const hapticLabel = document.querySelector(".haptic-tap");
function buzz() {
  if (navigator.vibrate) { navigator.vibrate(90); return; } // Android + others
  // iOS has no Vibration API; toggling a <input switch> emits a light haptic on 17.4+
  try { if (hapticLabel) hapticLabel.click(); } catch {}
}

function colorHex(name) {
  const c = COLORS.find((x) => x.name === name);
  return c ? c.hex : NEUTRAL;
}

function buildGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = i;
    grid.appendChild(cell);
  }
}

function buildControls() {
  const wrap = $("#controls");
  wrap.innerHTML = "";
  const chans = activeChannels();
  wrap.style.gridTemplateColumns = chans.length <= 2 ? "1fr" : "repeat(2, 1fr)";
  chans.forEach((ch) => {
    const btn = document.createElement("button");
    btn.className = "match-btn";
    btn.dataset.channel = ch;
    btn.textContent = `${LABELS[ch]} match`;
    btn.onclick = () => respond(ch);
    wrap.appendChild(btn);
  });
}

function isTarget(index, ch) {
  const n = game.n;
  if (index < n) return false;
  return game.sequence[index][ch] === game.sequence[index - n][ch];
}

function startGame() {
  const chans = activeChannels();
  const total = settings.trials + settings.n; // first N turns are warm-up (can't be matches)
  game = {
    n: settings.n,
    pace: settings.pace,
    total,
    index: -1,
    sequence: buildSequence(total, settings.n, chans),
    responded: {},
    right: 0,
    wrong: 0,
    stats: Object.fromEntries(chans.map((c) => [c, { hits: 0, misses: 0, fa: 0, targets: 0, nonTargets: 0 }])),
    timer: null,
  };
  buildGrid();
  buildControls();
  $("#hudN").textContent = `N = ${game.n}`;
  updateLiveScore();
  show("game");
  nextTurn();
}

function nextTurn() {
  if (game.index >= 0) scoreTurn(game.index); // resolve the turn that just ended

  game.index++;
  $("#progressBar").style.width = `${(game.index / game.total) * 100}%`;

  if (game.index >= game.total) return endGame();

  const stim = game.sequence[game.index];
  game.responded = {};

  renderStimulus(stim);
  if (settings.channels.sound && stim.sound != null) speak(stim.sound);

  setTimeout(() => clearStimulus(), Math.min(700, game.pace * 0.4));
  game.timer = setTimeout(nextTurn, game.pace);
}

function renderStimulus(stim) {
  clearStimulus();
  const posIndex = settings.channels.position ? stim.position : 4;
  const cell = $(`.cell[data-index="${posIndex}"]`);
  cell.classList.add("on"); // the square lights up; the digit inside carries the color
  if (settings.channels.number) {
    cell.textContent = stim.number;
    cell.style.color = settings.channels.color ? colorHex(stim.color) : "";
  } else if (settings.channels.color) {
    cell.style.background = colorHex(stim.color); // no digit to tint — color the square instead
  }
}

function clearStimulus() {
  document.querySelectorAll(".cell").forEach((c) => {
    c.classList.remove("on");
    c.style.background = "";
    c.style.color = "";
    c.textContent = "";
  });
}

function respond(ch) {
  if (!game || game.index < game.n || game.responded[ch]) return; // ignore during warm-up
  game.responded[ch] = true;
  const hit = isTarget(game.index, ch);
  if (hit) { game.stats[ch].hits++; game.right++; }
  else { game.stats[ch].fa++; game.wrong++; }
  flash(ch, hit);
  updateLiveScore();
}

function flash(ch, good) {
  if (!good) buzz(); // vibrate on any error
  if (!settings.feedback) return;
  const btn = $(`.match-btn[data-channel="${ch}"]`);
  if (!btn) return;
  const cls = good ? "flash-good" : "flash-bad";
  btn.classList.add(cls);
  setTimeout(() => btn.classList.remove(cls), 240);
}

// Resolve a turn once its response window closes: tally targets, and flag
// any match the player missed (button flashes red).
function scoreTurn(index) {
  if (index < game.n) return; // warm-up turns are not scored
  for (const ch of activeChannels()) {
    const target = isTarget(index, ch);
    const s = game.stats[ch];
    if (target) {
      s.targets++;
      if (!game.responded[ch]) { s.misses++; game.wrong++; flash(ch, false); }
    } else {
      s.nonTargets++;
    }
  }
  updateLiveScore();
}

function updateLiveScore() {
  $("#liveScore").innerHTML =
    `<span class="ls ls-right">&#10003; ${game.right}</span>` +
    `<span class="ls ls-wrong">&#10007; ${game.wrong}</span>`;
}

function quitGame() {
  if (game && game.timer) clearTimeout(game.timer);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  game = null;
  show("home");
  renderHome();
}

/* ============================================================
   RESULTS
   ============================================================ */
function endGame() {
  clearTimeout(game.timer);
  const chans = activeChannels();
  const perChannel = chans.map((ch) => {
    const s = game.stats[ch];
    const denom = s.targets + s.fa; // matches to catch + false presses
    const pct = denom ? Math.round((s.hits / denom) * 100) : 100;
    return { ch, pct, hits: s.hits, targets: s.targets, fa: s.fa };
  });
  const overall = Math.round(perChannel.reduce((a, c) => a + c.pct, 0) / perChannel.length);

  saveHistory({ t: Date.now(), n: game.n, overall, dims: Object.fromEntries(perChannel.map((c) => [c.ch, c.pct])) });
  recordBest(game.n, overall);

  nChange = null;
  if (settings.adaptive) {
    const prev = settings.n;
    if (overall >= 95) settings.n = Math.min(9, settings.n + 1);
    else if (overall < 60) settings.n = Math.max(1, settings.n - 1);
    if (settings.n !== prev) nChange = { from: prev, to: settings.n };
    saveSettings();
  }

  renderResults(perChannel, overall);
  game = null;
  show("results");
}

function ring(pct, name, color) {
  const r = 34, c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const stroke = color || "var(--accent)";
  return `
    <div class="ring">
      <svg viewBox="0 0 84 84">
        <circle class="ring-track" cx="42" cy="42" r="${r}"></circle>
        <circle class="ring-fill" cx="42" cy="42" r="${r}" style="stroke:${stroke}"
          stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
      </svg>
      <div class="pct">${pct}%</div>
      <div class="name">${name}</div>
    </div>`;
}

function renderResults(perChannel, overall) {
  const banner = $("#nChangeBanner");
  if (nChange) {
    const up = nChange.to > nChange.from;
    banner.textContent = up
      ? `Level up! Next block moves to N = ${nChange.to}`
      : `Eased off — next block drops to N = ${nChange.to}`;
    banner.className = `n-banner ${up ? "up" : "down"}`;
  } else {
    banner.className = "n-banner hidden";
  }

  $("#scoreRings").innerHTML =
    ring(overall, "Total", LINE_COLORS.total) +
    perChannel.map((c) => ring(c.pct, LABELS[c.ch], LINE_COLORS[c.ch])).join("");

  $("#resultDetail").innerHTML =
    perChannel
      .map((c) => `<div><strong>${LABELS[c.ch]}</strong> — caught ${c.hits} of ${c.targets} matches · ${c.fa} false</div>`)
      .join("") +
    `<div class="metric-note">Percent = matches caught &divide; (matches + false presses). Both missing a match and pressing when there wasn't one pull it down.</div>`;

  drawHistoryChart($("#historyChart"), $("#chartLegend"));
}

/* ---------- History screen ---------- */
function renderHistoryScreen() {
  const h = getHistory();
  const summary = $("#histSummary");
  if (!h.length) {
    summary.innerHTML = `<p class="chart-empty">No blocks played yet.</p>`;
  } else {
    let bests; try { bests = JSON.parse(localStorage.getItem("nback.best") || "{}"); } catch { bests = {}; }
    const bestList = Object.keys(bests).sort().map((n) => `N=${n}: ${bests[n]}%`).join(" · ");
    summary.innerHTML =
      `<div class="hist-count">${h.length} block${h.length === 1 ? "" : "s"} played</div>` +
      (bestList ? `<div class="hist-bests">Best total score by level — ${bestList}</div>` : "");
  }
  drawHistoryChart($("#histChart"), $("#histLegend"));
}

/* ---------- Progress chart (history line diagram) ---------- */
function drawHistoryChart(chart, legend) {
  const h = getHistory();
  if (!h.length) {
    chart.innerHTML = `<p class="chart-empty">No blocks played yet.</p>`;
    legend.innerHTML = "";
    return;
  }

  const W = 460, H = 210, padL = 30, padR = 10, padT = 10, padB = 22;
  const n = h.length;
  const X = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const Y = (v) => padT + (1 - v / 100) * (H - padT - padB);

  const dims = ["total", "position", "number", "color", "sound"];
  const present = dims.filter((d) => d === "total" || h.some((e) => e.dims && e.dims[d] != null));

  // horizontal gridlines at 0/25/50/75/100
  let grid = "";
  for (const g of [0, 25, 50, 75, 100]) {
    grid += `<line x1="${padL}" y1="${Y(g)}" x2="${W - padR}" y2="${Y(g)}" class="grid-line"></line>`;
    grid += `<text x="${padL - 6}" y="${Y(g) + 3}" class="axis-label" text-anchor="end">${g}</text>`;
  }

  let paths = "";
  for (const d of present) {
    const pts = h.map((e, i) => {
      const v = d === "total" ? e.overall : (e.dims ? e.dims[d] : null);
      return v == null ? null : { x: X(i), y: Y(v) };
    });
    // split into continuous segments so gaps (dimension off that block) break the line
    let seg = [];
    const flush = () => {
      if (seg.length) {
        const str = seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        paths += `<polyline points="${str}" fill="none" stroke="${LINE_COLORS[d]}" stroke-width="2" stroke-linejoin="round"></polyline>`;
        paths += seg.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${LINE_COLORS[d]}"></circle>`).join("");
        seg = [];
      }
    };
    for (const p of pts) { if (p == null) flush(); else seg.push(p); }
    flush();
  }

  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}${paths}</svg>`;
  legend.innerHTML = present
    .map((d) => `<span class="leg"><i style="background:${LINE_COLORS[d]}"></i>${d === "total" ? "Total" : LABELS[d]}</span>`)
    .join("");
}

/* ---------- Persistence ---------- */
function getBest(n) {
  try { return (JSON.parse(localStorage.getItem("nback.best") || "{}"))[n] ?? null; } catch { return null; }
}
function recordBest(n, pct) {
  let bests; try { bests = JSON.parse(localStorage.getItem("nback.best") || "{}"); } catch { bests = {}; }
  if (bests[n] == null || pct > bests[n]) {
    bests[n] = pct;
    localStorage.setItem("nback.best", JSON.stringify(bests));
  }
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem("nback.history") || "[]"); } catch { return []; }
}
function saveHistory(entry) {
  const h = getHistory();
  h.push(entry);
  localStorage.setItem("nback.history", JSON.stringify(h.slice(-100)));
}
function clearHistory() {
  localStorage.removeItem("nback.history");
  localStorage.removeItem("nback.best");
}

/* ============================================================
   WIRING
   ============================================================ */
document.addEventListener("keydown", (e) => {
  if (!game) return;
  const key = e.key.toLowerCase();
  for (const ch of activeChannels()) {
    if (key === KEYS[ch]) { e.preventDefault(); respond(ch); }
  }
});

$("#quitBtn").onclick = quitGame;
$("#againBtn").onclick = startGame;
$("#homeBtn").onclick = () => { show("home"); renderHome(); };
$("#clearHistBtn").onclick = () => {
  if (confirm("Clear all saved history and best scores?")) {
    clearHistory();
    drawHistoryChart($("#historyChart"), $("#chartLegend"));
    renderBest();
  }
};

$("#historyBtn").onclick = () => { renderHistoryScreen(); show("history"); };
$("#histBackBtn").onclick = () => { show("home"); renderHome(); };
$("#howtoBtn").onclick = () => show("howto");
$("#howtoBackBtn").onclick = () => { show("home"); renderHome(); };
$("#histClearBtn").onclick = () => {
  if (confirm("Clear all saved history and best scores?")) {
    clearHistory();
    renderHistoryScreen();
  }
};

bindHome();
renderHome();
show("home");

/* ---------- PWA service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
