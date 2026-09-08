/* =============================================================
   The whole page runs from this one file.

   The live section reads the Last.fm API. It goes through the
   /api/lastfm function if one is deployed, so the key stays on
   the server, and otherwise calls Last.fm straight from the
   browser with the key from config.js. See lastfm() below and
   the README for the two paths.

   The archive section just draws whatever is in archive-data.js.

   Motion is kept light. Blocks fade in as you scroll, numbers
   count up once, and bars grow from nothing the first time you
   see them.
   ============================================================= */

"use strict";

/* Your settings live in config.js, which git ignores. Start from config.example.js. */
const CFG = window.HEX_CONFIG || {};
const LASTFM_KEY = CFG.lastfmApiKey || "";
const LASTFM_USER = CFG.lastfmUser || "";
const DISPLAY_NAME = CFG.displayName || LASTFM_USER || "listener";
const IDENTITY_FROM_CONFIG = Boolean(CFG.displayName || CFG.lastfmUser);
const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const PROXY_API = "/api/lastfm";
// How often to re-check what is playing. The heavier calls (totals, top
// lists) run far less often since they barely move.
const NOW_MS = CFG.refreshMs || 8000;
const FULL_MS = Math.max(NOW_MS * 6, 60000);

const REDUCE_MOTION =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- tiny helpers ---------- */

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const nf = (n) => Number(n).toLocaleString("en-US");

function fmtNum(v, decimals) {
  return decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-US");
}

function parseLastfm(d) {
  if (d && d.error) throw new Error(d.message || `Last.fm error ${d.error}`);
  return d;
}

/* Two ways to reach Last.fm:
   - proxy:  a same-origin /api/lastfm function holds the key and adds it
             server-side, so the browser never sees it (Path B).
   - direct: the browser calls Last.fm itself with the key from config.js
             (Path A, the default).

   The first request works out which one is available and every request
   after that takes the same path. If a deployed proxy later disappears and
   there is a key in config.js, requests drop back to direct on their own. */
let apiRoute = "unknown"; // "unknown" | "proxy" | "direct"
let routeCheck = null;

function fetchViaProxy(method, params) {
  if (!/^https?:$/.test(location.protocol)) {
    const e = new Error("proxy needs http(s)");
    e.noProxy = true;
    return Promise.reject(e);
  }
  const u = new URL(PROXY_API, location.origin);
  u.searchParams.set("method", method);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  return fetch(u, { cache: "no-store" }).then((r) => {
    // 404 (no function deployed) or 501 (deployed but no env vars) means the
    // proxy is not really there. Flag it so the caller can fall back.
    if (r.status === 404 || r.status === 501) {
      const e = new Error("proxy not available");
      e.noProxy = true;
      throw e;
    }
    if (!r.ok) throw new Error(`${method} via proxy: HTTP ${r.status}`);
    return r.json().then(parseLastfm);
  });
}

function fetchDirect(method, params) {
  if (!LASTFM_KEY || !LASTFM_USER) {
    return Promise.reject(new Error("no Last.fm key in config.js"));
  }
  const u = new URL(LASTFM_API);
  u.searchParams.set("method", method);
  u.searchParams.set("user", LASTFM_USER);
  u.searchParams.set("api_key", LASTFM_KEY);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  return fetch(u.toString(), { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${method} → HTTP ${r.status}`);
    return r.json().then(parseLastfm);
  });
}

function lastfmOnce(method, params = {}) {
  if (apiRoute === "proxy") {
    return fetchViaProxy(method, params).catch((err) => {
      // The proxy answered before and is gone now. Slip back to the direct
      // path if config.js has a key for it.
      if (err && err.noProxy && LASTFM_KEY && LASTFM_USER) {
        apiRoute = "direct";
        return fetchDirect(method, params);
      }
      throw err;
    });
  }
  if (apiRoute === "direct") return fetchDirect(method, params);

  // First call settles the route. Callers that fire together share this probe.
  if (!routeCheck) {
    routeCheck = fetchViaProxy("user.getInfo", {}).then(
      () => {
        apiRoute = "proxy";
      },
      (err) => {
        if (err && err.noProxy) {
          apiRoute = "direct";
        } else {
          // The probe could not say for sure. Use a config.js key if there
          // is one, otherwise assume the proxy is there.
          apiRoute = LASTFM_KEY && LASTFM_USER ? "direct" : "proxy";
        }
      }
    );
  }
  return routeCheck.then(() => lastfmOnce(method, params));
}

// A dropped request or a brief blip should not cost a whole refresh cycle,
// so retry a failed call a couple of times with a short backoff before
// giving up. A "noProxy" error is a routing decision, not a blip, so it is
// not retried.
function lastfm(method, params = {}, attempt = 0) {
  return lastfmOnce(method, params).catch((err) => {
    if ((err && err.noProxy) || attempt >= 2) throw err;
    const wait = 700 * (attempt + 1);
    return new Promise((r) => setTimeout(r, wait)).then(() =>
      lastfm(method, params, attempt + 1)
    );
  });
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(ym) {
  const [y, m] = String(ym).split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${y}` : String(ym);
}

function ago(uts) {
  const s = Date.now() / 1000 - Number(uts);
  if (s < 45) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  const w = d / 7;
  if (w < 4.5) return `${Math.floor(w)}w ago`;
  const mo = d / 30.44;
  if (mo < 12) return `${Math.floor(mo)}mo ago`;
  return `${Math.floor(d / 365.25)}y ago`;
}

function artistName(a) {
  return (a && (a.name || a["#text"])) || "";
}

// Last.fm hands back this image when a track has no artwork. Skip it so the
// backdrop does not fill up with a grey placeholder square.
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

// Give back the biggest real artwork URL from a Last.fm image list.
function bestImage(images) {
  if (!Array.isArray(images)) return "";
  const order = ["mega", "extralarge", "large", "medium", "small"];
  for (const size of order) {
    const hit = images.find(
      (im) => im.size === size && im["#text"] && !im["#text"].includes(LASTFM_PLACEHOLDER)
    );
    if (hit) return hit["#text"];
  }
  return "";
}

// Crossfade the backdrop when the track changes. Paint the new artwork on
// whichever layer is hidden, then swap which one is shown so the two images
// cross over instead of cutting.
let currentArtUrl = "";
let artFront = null;
function setArtBackground(url) {
  if (!url || url === currentArtUrl) return;
  const img = new Image();
  img.onload = () => {
    currentArtUrl = url;
    const layerA = $("art-layer-a");
    const layerB = $("art-layer-b");
    const showing = artFront || layerA;
    const next = showing === layerA ? layerB : layerA;
    next.style.backgroundImage = `url("${url}")`;
    next.classList.add("shown");
    showing.classList.remove("shown");
    artFront = next;
    $("art-bg").classList.add("loaded");
    updateProgress();
  };
  img.src = url;
}
function link(url, text, cls) {
  if (!url) return `<span${cls ? ` class="${cls}"` : ""}>${esc(text)}</span>`;
  return `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
}

/* ---------- motion: reveal + count-up + bar growth ---------- */

function countUp(node, to, opts = {}) {
  const { suffix = "", decimals = 0, dur = 1100 } = opts;
  node.dataset.count = to;
  if (REDUCE_MOTION) {
    node.textContent = fmtNum(to, decimals) + suffix;
    return;
  }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    node.textContent = fmtNum(to * e, decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else node.textContent = fmtNum(to, decimals) + suffix;
  }
  requestAnimationFrame(tick);
}

// Put a live number on screen. The data can land before you have scrolled to
// it or after, so handle both: animate now if the block is already showing,
// otherwise leave it at zero and let the scroll handler start the count later.
function setNumber(node, value, opts = {}) {
  const revealed = node.closest(".reveal");
  const isIn = !revealed || revealed.classList.contains("in");
  if (isIn && !REDUCE_MOTION) {
    countUp(node, value, opts);
  } else {
    node.dataset.count = value;
    node.dataset.countOpts = JSON.stringify(opts);
    // Nothing to animate to yet, so show zero. Reduced motion goes straight
    // to the real number.
    const shown = REDUCE_MOTION ? value : 0;
    node.textContent = fmtNum(shown, opts.decimals || 0) + (opts.suffix || "");
  }
}

function growBars(scope) {
  scope.querySelectorAll(".hbar i[data-w]").forEach((i) => {
    i.style.width = i.dataset.w + "%";
  });
  scope.querySelectorAll(".vchart .v[data-h]").forEach((v) => {
    v.style.height = v.dataset.h + "%";
    v.classList.add("grown");
  });
}

function runCounts(scope) {
  scope.querySelectorAll("[data-count]").forEach((node) => {
    if (node.dataset.counted) return;
    const to = parseFloat(node.dataset.count);
    if (!isFinite(to)) return;
    node.dataset.counted = "1";
    const opts = node.dataset.countOpts ? JSON.parse(node.dataset.countOpts) : {};
    countUp(node, to, opts);
  });
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add("in");
      runCounts(el);
      growBars(el);
      revealObserver.unobserve(el);
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
);

function observeReveals(root = document) {
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => revealObserver.observe(el));
}

/* ---------- tooltip ---------- */

const tipEl = $("tooltip");

function positionTip(x, y) {
  const pad = 14;
  const r = tipEl.getBoundingClientRect();
  let nx = x + pad;
  let ny = y + pad;
  if (nx + r.width + 8 > window.innerWidth) nx = x - r.width - pad;
  if (ny + r.height + 8 > window.innerHeight) ny = y - r.height - pad;
  tipEl.style.transform = `translate(${Math.max(4, nx)}px, ${Math.max(4, ny)}px)`;
}

function bindTooltips(root) {
  root.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t || !root.contains(t)) return;
    tipEl.textContent = t.dataset.tip;
    tipEl.classList.add("show");
    positionTip(e.clientX, e.clientY);
  });
  root.addEventListener("pointermove", (e) => {
    if (!tipEl.classList.contains("show")) return;
    positionTip(e.clientX, e.clientY);
  });
  root.addEventListener("pointerout", (e) => {
    const t = e.target.closest("[data-tip]");
    if (t && !t.contains(e.relatedTarget)) tipEl.classList.remove("show");
  });
  root.addEventListener("pointerleave", () => tipEl.classList.remove("show"));
}

/* ---------- scroll progress ---------- */

const progressEl = $("scroll-progress");
const artBgEl = $("art-bg");
const ART_BASE_OPACITY = 0.34;
let progressQueued = false;
function updateProgress() {
  progressQueued = false;
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const p = max > 0 ? Math.min(1, doc.scrollTop / max) : 0;
  progressEl.style.transform = `scaleX(${p})`;

  // Fade the backdrop out as you scroll away from the top.
  if (artBgEl.classList.contains("loaded")) {
    const fade = Math.min(1, doc.scrollTop / (doc.clientHeight * 1.15));
    artBgEl.style.opacity = (ART_BASE_OPACITY * (1 - fade)).toFixed(3);
  }
}
window.addEventListener(
  "scroll",
  () => {
    if (progressQueued) return;
    progressQueued = true;
    requestAnimationFrame(updateProgress);
  },
  { passive: true }
);

/* ============================================================
   LIVE SECTION
   ============================================================ */

function recentTracks(recent) {
  const t = recent && recent.recenttracks && recent.recenttracks.track;
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function clearLiveSkeletons(labelText) {
  const label = $("now-label");
  if (label.classList.contains("skeleton-text")) {
    label.classList.remove("skeleton-text");
    label.textContent = labelText;
  }
  ["recent", "top-artists", "top-albums"].forEach((id) => {
    const list = $(id);
    if (list.querySelector(".skeleton-row")) {
      list.innerHTML = '<li class="muted">Could not load. Retrying soon.</li>';
    }
  });
}

// When a full refresh comes back empty, do not sit on the broken page for
// the whole FULL_MS gap. Retry sooner, backing off each time until things
// recover or the delay reaches the normal cycle.
let liveFailStreak = 0;
let liveRetryTimer = null;

async function loadLive() {
  clearTimeout(liveRetryTimer);
  const calls = [
    ["recent", { m: "user.getRecentTracks", p: { limit: 14, extended: 1 } }],
    ["info", { m: "user.getInfo", p: {} }],
    ["artists", { m: "user.getTopArtists", p: { period: "overall", limit: 8 } }],
    ["albums", { m: "user.getTopAlbums", p: { period: "overall", limit: 8 } }],
  ];

  const settled = await Promise.allSettled(calls.map((c) => lastfm(c[1].m, c[1].p)));
  const data = {};
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") data[calls[i][0]] = r.value;
    else failed.push(calls[i][0]);
  });

  if (data.recent) {
    renderNow(data.recent);
    renderRecent(data.recent);
  }
  if (data.info) renderInfo(data.info, data.artists);
  if (data.artists) renderTopArtists(data.artists);
  if (data.albums) renderTopAlbums(data.albums);

  const el = $("live-err");
  if (failed.length === calls.length) {
    el.hidden = false;
    if (apiRoute !== "proxy" && (!LASTFM_KEY || !LASTFM_USER)) {
      el.textContent =
        "No Last.fm access yet. Put a key in config.js, or deploy the /api/lastfm function. The README walks through both.";
      clearLiveSkeletons("Not set up");
    } else {
      liveFailStreak = Math.min(liveFailStreak + 1, 20);
      const wait = Math.min(FULL_MS, 8000 * liveFailStreak);
      el.textContent = `Can't reach Last.fm right now. Trying again in ${Math.round(wait / 1000)} seconds.`;
      clearLiveSkeletons("Could not load");
      liveRetryTimer = setTimeout(loadLive, wait);
    }
  } else if (failed.length) {
    liveFailStreak = 0;
    el.hidden = false;
    el.textContent = `Some Last.fm data did not load: ${failed.join(", ")}. Retrying soon.`;
  } else {
    liveFailStreak = 0;
    el.hidden = true;
  }
  stampUpdated();
}

// The quick poll: just what is playing and the recent list. A missed poll
// says nothing; the full refresh is what reports a real outage.
async function loadNowPlaying() {
  try {
    const recent = await lastfm("user.getRecentTracks", { limit: 14, extended: 1 });
    renderNow(recent);
    renderRecent(recent);
    $("live-err").hidden = true;
    stampUpdated();
  } catch (e) {
    /* leave it for the next full refresh to surface */
  }
}

function renderNow(recent) {
  const first = recentTracks(recent)[0];
  const pulse = $("pulse");
  const label = $("now-label");
  label.classList.remove("skeleton-text");

  if (!first) {
    label.textContent = "Nothing played yet";
    $("now-track").textContent = "—";
    return;
  }

  const nowPlaying = first["@attr"] && first["@attr"].nowplaying === "true";
  pulse.classList.toggle("live", !!nowPlaying);
  label.textContent = nowPlaying
    ? "Playing right now"
    : `Last played ${first.date ? ago(first.date.uts) : "a while ago"}`;

  $("now-track").innerHTML = link(first.url, first.name || "—");
  $("now-artist").innerHTML = link(
    first.artist && first.artist.url,
    artistName(first.artist)
  );
  const album = first.album && first.album["#text"];
  $("now-meta").textContent = album || "";

  setArtBackground(bestImage(first.image));
}

function renderInfo(info, topArtists) {
  const u = (info && info.user) || {};

  // On the proxy path config.js may not carry a username, so take the real
  // name from the profile once it arrives.
  if (!IDENTITY_FROM_CONFIG && u.name) applyIdentity(u.name);

  if (u.playcount != null) {
    setNumber($("stat-scrobbles"), Number(u.playcount));
  }

  let artists = Number(u.artist_count);
  if (!artists) {
    const attr =
      topArtists && topArtists.topartists && topArtists.topartists["@attr"];
    artists = attr ? Number(attr.total) : 0;
  }
  if (artists) setNumber($("stat-artists"), artists);

  const reg = u.registered && (u.registered.unixtime || u.registered["#text"]);
  if (reg) $("stat-since").textContent = new Date(Number(reg) * 1000).getFullYear();
}

function renderRecent(recent) {
  const list = $("recent");
  const rows = recentTracks(recent)
    .filter((t) => !(t["@attr"] && t["@attr"].nowplaying === "true"))
    .slice(0, 8);

  if (!rows.length) {
    list.innerHTML = '<li class="muted">No plays to show yet.</li>';
    return;
  }

  list.innerHTML = rows
    .map((t) => {
      const time = t.date ? ago(t.date.uts) : "";
      return `<li>
        <span class="t-main">
          <span class="t-name">${link(t.url, t.name)}</span>
          <span class="t-artist"> · ${esc(artistName(t.artist))}</span>
        </span>
        <span class="t-time">${esc(time)}</span>
      </li>`;
    })
    .join("");
}

function renderTopArtists(data) {
  const list = $("top-artists");
  const items = (data && data.topartists && data.topartists.artist) || [];
  if (!items.length) {
    list.innerHTML = '<li class="muted">Nothing to show.</li>';
    return;
  }
  list.innerHTML = items
    .map(
      (a, i) => `<li>
        <span class="idx">${i + 1}</span>
        <span class="nm">${link(a.url, a.name)}</span>
        <span class="ct">${nf(a.playcount)} plays</span>
      </li>`
    )
    .join("");
}

function renderTopAlbums(data) {
  const list = $("top-albums");
  const items = (data && data.topalbums && data.topalbums.album) || [];
  if (!items.length) {
    list.innerHTML = '<li class="muted">Nothing to show.</li>';
    return;
  }
  list.innerHTML = items
    .map(
      (a, i) => `<li>
        <span class="idx">${i + 1}</span>
        <span class="nm">${link(a.url, a.name)}<span class="sub">${esc(
        artistName(a.artist)
      )}</span></span>
        <span class="ct">${nf(a.playcount)} plays</span>
      </li>`
    )
    .join("");
}

/* ============================================================
   ARCHIVE SECTION
   ============================================================ */

function hasVal(v) {
  return v !== null && v !== undefined && !Number.isNaN(v);
}
function pending(el) {
  el.innerHTML = '<p class="muted">Nothing here yet.</p>';
}

// Draw a row of horizontal bars. Each bar remembers its width in data-w and
// grows into it when its block scrolls into view.
function hbars(el, entries, opts = {}) {
  const clean = (entries || []).filter((e) => hasVal(e.value));
  if (!clean.length) return pending(el);

  const total =
    opts.total != null ? opts.total : clean.reduce((s, e) => s + e.value, 0);
  const max = Math.max(...clean.map((e) => e.value), 1);

  const unit = opts.unit || "";
  el.innerHTML = clean
    .map((e) => {
      const w = Math.round((e.value / max) * 100);
      const pctStr = total ? `${((e.value / total) * 100).toFixed(1)}%` : "—";
      const right = opts.pct ? pctStr : nf(e.value);
      const startW = REDUCE_MOTION ? w : 0;
      const tip = opts.percentValues
        ? `${e.label} · ${Number(e.value).toFixed(1)}%`
        : `${e.label} · ${nf(e.value)}${unit ? " " + unit : ""}` +
          (total ? ` · ${pctStr}` : "");
      return `<div class="hbar" data-tip="${esc(tip)}">
        <span class="lbl">${esc(e.label)}</span>
        <span class="track"><i class="${e.accent ? "accent" : ""}" data-w="${w}" style="width:${startW}%"></i></span>
        <span class="val">${right}</span>
      </div>`;
    })
    .join("");

  // Grow the bars now if this block is already on screen.
  const host = el.closest(".reveal");
  if (!host || host.classList.contains("in")) growBars(el);
}

// Draw a vertical bar chart. Hands back the tallest bar and its value, or null
// when there is nothing to draw.
function vchart(el, entries, opts = {}) {
  const clean = entries || [];
  if (!clean.length || clean.every((e) => !hasVal(e.value))) {
    pending(el);
    return null;
  }
  const vals = clean.map((e) => (hasVal(e.value) ? e.value : 0));
  const max = Math.max(...vals, 1);
  let peak = 0;
  vals.forEach((v, i) => {
    if (v > vals[peak]) peak = i;
  });

  const unit = opts.unit ? " " + opts.unit : "";
  const stepDelay = Math.min(8, 380 / clean.length);
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "vchart";
  clean.forEach((e, i) => {
    const v = hasVal(e.value) ? e.value : 0;
    const h = Math.max(2, Math.round((v / max) * 100));
    const b = document.createElement("div");
    b.className = "v" + (i === peak ? " peak" : "");
    b.dataset.h = h;
    b.style.height = REDUCE_MOTION ? h + "%" : "0%";
    if (!REDUCE_MOTION) b.style.transitionDelay = Math.round(i * stepDelay) + "ms";
    b.dataset.tip = `${e.label} · ${v}${unit}`;
    if (REDUCE_MOTION) b.classList.add("grown");
    wrap.appendChild(b);
  });
  wrap.setAttribute("role", "img");
  wrap.setAttribute(
    "aria-label",
    `${clean.length} bars, ${clean[0].label} to ${clean[clean.length - 1].label}. ` +
      `Peak ${clean[peak].label} at ${vals[peak]}${unit}.`
  );
  el.appendChild(wrap);

  const host = el.closest(".reveal");
  if (!host || host.classList.contains("in")) growBars(el);

  return { peak: clean[peak], peakValue: vals[peak] };
}

function renderArchive() {
  const A =
    window.ARCHIVE ||
    (typeof ARCHIVE !== "undefined" ? ARCHIVE : null) ||
    {};

  const note = $("archive-note");
  if (!A.ready) {
    note.hidden = false;
    note.textContent =
      "The charts below are ready, but there is no data in them yet. " +
      "Add the export numbers to archive-data.js and they will fill in.";
  } else {
    note.hidden = true;
  }

  hbars($("arc-composition"), A.composition, { pct: true, unit: "tracks" });

  hbars(
    $("arc-artists"),
    (A.topArtists || []).map((a) => ({
      label: a.name,
      value: a.value,
      accent: /juice\s*wrld/i.test(a.name || ""),
    })),
    { total: A.totalTracks || undefined, pct: true, unit: "tracks" }
  );

  // How much of the library is Juice WRLD
  const juiceNum = $("arc-juice-num");
  if (hasVal(A.juiceWrldDominancePct)) {
    setNumber(juiceNum, A.juiceWrldDominancePct, { suffix: "%", decimals: 1 });
    hbars(
      $("arc-juice-bar"),
      [
        { label: "Juice WRLD", value: A.juiceWrldDominancePct, accent: true },
        { label: "Everyone else", value: 100 - A.juiceWrldDominancePct },
      ],
      { total: 100, pct: true, percentValues: true }
    );
  } else {
    juiceNum.textContent = "—";
    pending($("arc-juice-bar"));
  }
  $("arc-juice-cap").textContent = A.juiceWrldNote || "";

  // Popularity: the bar labels show raw counts, the tooltip adds the share.
  const pop = A.popularity || {};
  hbars($("arc-popularity"), pop.buckets, { unit: "tracks" });
  $("arc-popularity-cap").textContent = hasVal(pop.mean)
    ? `Average score is ${pop.mean} out of 100. Higher means more people are listening.`
    : "";

  // Explicit
  const explNum = $("arc-explicit-num");
  if (hasVal(A.explicitPct)) {
    setNumber(explNum, A.explicitPct, { suffix: "%", decimals: 1 });
    hbars(
      $("arc-explicit-bar"),
      [
        { label: "Marked explicit", value: A.explicitPct },
        { label: "Clean", value: 100 - A.explicitPct },
      ],
      { total: 100, pct: true, percentValues: true }
    );
  } else {
    explNum.textContent = "—";
    pending($("arc-explicit-bar"));
  }
  $("arc-explicit-cap").textContent = A.explicitNote || "";

  // Release years
  const [y0, y1] = A.releaseYearRange || [1975, 2026];
  const years = A.releaseYears || {};
  const anyYears = Object.keys(years).length > 0;
  if (anyYears) {
    const entries = [];
    for (let y = y0; y <= y1; y++) {
      entries.push({ label: String(y), value: years[y] != null ? years[y] : 0 });
    }
    const yr = vchart($("arc-years"), entries, { unit: "tracks" });
    $("arc-years-cap").textContent = yr
      ? `Goes back to ${y0}, but ${yr.peak.label} is the biggest year with ${yr.peakValue} tracks.`
      : "";
  } else {
    pending($("arc-years"));
    $("arc-years-cap").textContent = "";
  }

  // Monthly adds
  const months = (A.monthlyAdds || []).map((m) => ({
    label: fmtMonth(m.month),
    value: m.value,
  }));
  const mo = vchart($("arc-monthly"), months, { unit: "tracks" });
  $("arc-monthly-cap").textContent = mo
    ? `From ${months[0].label} to ${months[months.length - 1].label}. The busiest month was ${mo.peak.label}, with ${mo.peakValue} tracks added.`
    : "";
}

/* ---------- footer ---------- */

function stampUpdated() {
  const t = new Date();
  $("foot-updated").textContent =
    "Last checked " +
    t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- boot ---------- */

function applyIdentity(name) {
  document.title = `${name} · Now & Then`;
  const h = $("profile-name");
  if (h) h.textContent = name;
  const foot = $("foot-name");
  if (foot) foot.textContent = name;
}

// Only stamp the name now if config actually gave us one. With no config
// (the proxy path), DISPLAY_NAME is just the "listener" fallback, and
// writing that would flash over the name already in the markup until
// loadLive() brings back the real one from the Last.fm profile. So in that
// case leave the markup alone and let loadLive() fill it in.
if (IDENTITY_FROM_CONFIG) applyIdentity(DISPLAY_NAME);
renderArchive();
observeReveals();
bindTooltips($("archive"));
updateProgress();

// One full load for the first paint. lastfm() sorts out the proxy path
// versus the direct path, and loadLive() reports if neither is set up.
loadLive();

// Then two intervals: a quick one for what is playing, a slow one for the
// totals and top lists.
let nowTimer = null;
let fullTimer = null;
function startPolling() {
  stopPolling();
  nowTimer = setInterval(loadNowPlaying, NOW_MS);
  fullTimer = setInterval(loadLive, FULL_MS);
}
function stopPolling() {
  clearInterval(nowTimer);
  clearInterval(fullTimer);
  clearTimeout(liveRetryTimer);
}
startPolling();

// Pause while the tab is hidden. On return, check straight away and resume.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else {
    loadNowPlaying();
    loadLive();
    startPolling();
  }
});
