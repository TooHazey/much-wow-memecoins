const API = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=meme-token&per_page=250&sparkline=true&price_change_percentage=1h,24h,7d,30d';
const REFRESH = 60;
const $ = id => document.getElementById(id);
const K = { h1: 'price_change_percentage_1h_in_currency', d1: 'price_change_percentage_24h_in_currency', d7: 'price_change_percentage_7d_in_currency', d30: 'price_change_percentage_30d_in_currency' };
const TF_LABEL = { h1: '1h', d1: '24h', d7: '7d', d30: '30d', live: 'since open' };

const S = { tf: 'd1', size: 'market_cap', group: 'chain', n: 100, range: 'auto', find: '', hideDoge: false, zoom: null };
// restore from URL hash
new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in S && k !== 'find' && k !== 'zoom') S[k] = k === 'n' ? +v : k === 'hideDoge' ? v === '1' : v; });

let coins = [], baseline = {}, lastPrice = {}, prevShown = {}, isLive = false, lastLoad = 0, nextAt = Date.now() + REFRESH * 1000, loading = false, R = 10;

/* ---------- format ---------- */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function fmtPrice(p) {
  if (p == null) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 0.01) return '$' + p.toFixed(4);
  const m = p.toFixed(14).match(/^0\.(0+)(\d{1,4})/);
  if (m && m[1].length >= 3) return '$0.0' + String(m[1].length).split('').map(d => SUB[d]).join('') + m[2];
  return '$' + p.toPrecision(4);
}
const fmtBig = n => n == null ? '—' : '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const fmtNum = n => n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const sign = (v, d = 2) => { if (v == null || !isFinite(v)) return '—'; if (Math.abs(v) >= 1000) return (v > 0 ? '+' : '-') + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(v)) + '%'; const r = +v.toFixed(d) || 0; return (r >= 0 ? '+' : '') + r.toFixed(d) + '%'; };
const cls = v => v == null ? '' : v >= 0 ? 'up' : 'dn';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chainOf = c => (window.CHAINS && window.CHAINS[c.id]) || 'Other chains';
const tierOf = c => c.market_cap >= 1e9 ? 'Mega · $1B+' : c.market_cap >= 1e8 ? 'Large · $100M–1B' : c.market_cap >= 1e7 ? 'Mid · $10–100M' : 'Small · <$10M';
const TIER_ORDER = ['Mega · $1B+', 'Large · $100M–1B', 'Mid · $10–100M', 'Small · <$10M'];

// aggregates cap single-coin outliers so one +50,000% micro cap can't swamp the average
const agg = c => { const v = chg(c); return v == null || !isFinite(v) ? 0 : Math.max(-100, Math.min(300, v)); };
function chg(c) {
  if (S.tf === 'live') { const b = baseline[c.id]; return b ? (c.current_price / b - 1) * 100 : 0; }
  return c[K[S.tf]];
}

/* ---------- color ---------- */
const STOPS = [[-1, [214, 52, 40]], [-.35, [110, 38, 32]], [0, [43, 43, 38]], [.35, [93, 122, 28]], [1, [200, 255, 58]]];
function color(v) {
  if (v == null || !isFinite(v)) return [43, 43, 38];
  const t = Math.max(-1, Math.min(1, v / R));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
    if (t >= a && t <= b) { const k = (t - a) / (b - a); return ca.map((x, j) => Math.round(x + (cb[j] - x) * k)); }
  }
  return STOPS[2][1];
}
const rgb = c => `rgb(${c.join(',')})`;
const light = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > .55;

/* ---------- selection ---------- */
function shown() {
  let l = coins.filter(c => c.market_cap > 0);
  if (S.hideDoge) l = l.filter(c => c.id !== 'dogecoin');
  l = l.sort((a, b) => b.market_cap - a.market_cap).slice(0, S.n);
  return l;
}
function groupKey(c) { return S.group === 'chain' ? chainOf(c) : S.group === 'tier' ? tierOf(c) : 'All'; }
function sizeVal(c) {
  return S.size === 'total_volume' ? Math.max(c.total_volume || 0, 1) : S.size === 'sqrt' ? Math.sqrt(c.market_cap) : S.size === 'equal' ? 1 : c.market_cap;
}
function autoRange(list) {
  if (S.range !== 'auto') return +S.range;
  const a = list.map(chg).filter(v => v != null && isFinite(v)).map(Math.abs).sort((x, y) => x - y);
  if (!a.length) return 10;
  const p = a[Math.floor(a.length * .85)] || 1;
  const nice = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100];
  return nice.find(n => n >= p) || 100;
}

/* ---------- layout + render ---------- */
const tileEls = new Map(), groupEls = new Map();
function layout() {
  const map = $('map'); if (!coins.length) return;
  const W = map.clientWidth, H = map.clientHeight;
  let list = shown();
  R = autoRange(list);
  $('lgLo').textContent = '-' + R + '%'; $('lgHi').textContent = '+' + R + '%';

  // group merge: tiny chain groups -> Other chains
  const counts = {};
  list.forEach(c => { const g = groupKey(c); counts[g] = (counts[g] || 0) + 1; });
  const gk = c => { const g = groupKey(c); return S.group === 'chain' && counts[g] < 2 && g !== 'Native L1' ? 'Other chains' : g; };
  if (S.zoom) list = list.filter(c => gk(c) === S.zoom);
  if (!list.length) { S.zoom = null; return layout(); }

  let rootData;
  if (S.group === 'none' || S.zoom) rootData = { children: list.map(c => ({ c })) };
  else {
    const groups = {};
    list.forEach(c => { const g = gk(c); (groups[g] = groups[g] || []).push({ c }); });
    rootData = { children: Object.entries(groups).map(([name, children]) => ({ name, children })) };
  }
  const root = d3.hierarchy(rootData).sum(d => d.c ? sizeVal(d.c) : 0).sort((a, b) => S.group === 'tier' && a.depth === 1 && !S.zoom ? TIER_ORDER.indexOf(a.data.name) - TIER_ORDER.indexOf(b.data.name) : b.value - a.value);
  d3.treemap().size([W, H]).tile(d3.treemapSquarify.ratio(1.25)).paddingTop(d => d.depth === 1 && d.children && d.data.name ? 20 : 0).paddingInner(d => d.depth === 0 ? 2 : 0).round(true)(root);

  // groups
  const liveG = new Set();
  (root.children || []).filter(g => g.data.name).forEach(g => {
    liveG.add(g.data.name);
    let el = groupEls.get(g.data.name);
    if (!el) { el = document.createElement('div'); el.className = 'hg'; el.innerHTML = '<div class="hg-label"></div>'; map.appendChild(el); groupEls.set(g.data.name, el);
      el.firstChild.addEventListener('click', () => { S.zoom = g.data.name; saveHash(); layout(); }); }
    const cs = g.leaves().map(l => l.data.c), cap = cs.reduce((s, c) => s + c.market_cap, 0);
    const w = cs.reduce((s, c) => s + agg(c) * c.market_cap, 0) / (cap || 1);
    Object.assign(el.style, { left: g.x0 + 'px', top: g.y0 + 'px', width: (g.x1 - g.x0) + 'px', height: (g.y1 - g.y0) + 'px' });
    el.firstChild.innerHTML = `<span>${esc(g.data.name)}</span><span class="muted">${cs.length}</span>${g.x1 - g.x0 > 150 ? `<span class="gchg ${cls(w)}">${sign(w)}</span>` : ''}`;
    el.firstChild.title = `Zoom into ${g.data.name}`;
  });
  groupEls.forEach((el, k) => { if (!liveG.has(k)) { el.remove(); groupEls.delete(k); } });

  // tiles
  const liveT = new Set(), q = S.find;
  root.leaves().forEach(l => {
    const c = l.data.c, id = c.id; liveT.add(id);
    let el = tileEls.get(id);
    if (!el) { el = document.createElement('div'); el.className = 'ht'; el.dataset.id = id; el.tabIndex = 0; map.appendChild(el); tileEls.set(id, el); }
    const w = l.x1 - l.x0, h = l.y1 - l.y0, v = chg(c), col = color(v);
    const sym = c.symbol.toUpperCase();
    const fs = Math.max(8, Math.min(64, w / (Math.max(sym.length, 3) * .66), h * .36));
    let html = '';
    if (w >= 26 && h >= 16) {
      if (w > 110 && h > 140) html += `<img src="${c.image}" alt="" onerror="this.remove()" width="${Math.min(48, fs * 1.1) | 0}" height="${Math.min(48, fs * 1.1) | 0}" loading="lazy">`;
      html += `<b style="font-size:${fs.toFixed(1)}px">${esc(sym)}</b>`;
      if (h > fs * 2.1 && w > 38) html += `<span style="font-size:${Math.max(9, fs * .42).toFixed(1)}px">${sign(v)}</span>`;
      if (h > fs * 3.3 && w > 90) html += `<em style="font-size:${Math.max(9, fs * .3).toFixed(1)}px">${fmtPrice(c.current_price)}</em>`;
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.style.left = l.x0 + 'px'; el.style.top = l.y0 + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.backgroundColor = rgb(col);
    el.classList.toggle('lt', light(col));
    const hit = q && (c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    el.classList.toggle('hit', !!hit); el.classList.toggle('dim', !!q && !hit);
    el.setAttribute('aria-label', `${c.name} ${sign(v)}`);
  });
  tileEls.forEach((el, k) => { if (!liveT.has(k)) { el.remove(); tileEls.delete(k); } });

  // crumbs
  $('crumbs').innerHTML = S.zoom ? `<button id="unzoom">All meme coins</button><span>›</span><span style="color:var(--ink)">${esc(S.zoom)}</span><span class="muted">(${list.length} coins · Esc to zoom out)</span>`
    : `<span>Showing top ${list.length} by market cap · grouped by ${S.group === 'none' ? 'nothing' : S.group === 'tier' ? 'size tier' : 'chain'} · colored by ${TF_LABEL[S.tf]} change</span>`;
  const u = $('unzoom'); if (u) u.onclick = () => { S.zoom = null; saveHash(); layout(); };

  renderSide(S.zoom ? list : shown());
}

function flashChanges() {
  coins.forEach(c => {
    const p = prevShown[c.id], el = tileEls.get(c.id);
    if (p != null && el && p !== c.current_price) {
      el.classList.remove('fu', 'fd'); void el.offsetWidth; el.classList.add(c.current_price > p ? 'fu' : 'fd');
    }
  });
}

/* ---------- side panels ---------- */
function renderSide(list) {
  const cap = list.reduce((s, c) => s + c.market_cap, 0), vol = list.reduce((s, c) => s + (c.total_volume || 0), 0);
  const vals = list.map(c => [c, chg(c)]).filter(([, v]) => v != null && isFinite(v));
  const wavg = vals.reduce((s, [c]) => s + agg(c) * c.market_cap, 0) / (vals.reduce((s, [c]) => s + c.market_cap, 0) || 1);
  const up = vals.filter(([, v]) => v > 0).length, dn = vals.filter(([, v]) => v < 0).length;
  $('kCap').textContent = fmtBig(cap); $('kVol').textContent = fmtBig(vol);
  $('kAvg').innerHTML = `<span class="${cls(wavg)}">${sign(wavg)}</span> <span class="muted small mono">${TF_LABEL[S.tf]}</span>`;
  $('kBreadth').innerHTML = `<span class="up">${up}</span> <span class="muted">/</span> <span class="dn">${dn}</span>`;
  $('kUp').style.width = (up / (vals.length || 1) * 100) + '%'; $('kDn').style.width = (dn / (vals.length || 1) * 100) + '%';
  const big = vals.reduce((a, b) => !a || Math.abs(b[1]) > Math.abs(a[1]) ? b : a, null);
  $('kTop').innerHTML = big ? `${esc(big[0].symbol.toUpperCase())} <span class="${cls(big[1])}">${sign(big[1], 1)}</span>` : '—';

  const sorted = [...vals].sort((a, b) => b[1] - a[1]);
  const li = ([c, v]) => `<li data-id="${c.id}"><span>${esc(c.symbol.toUpperCase())}</span><span class="${cls(v)}">${sign(v, 1)}</span></li>`;
  $('gainers').innerHTML = sorted.slice(0, 7).map(li).join('');
  $('losers').innerHTML = sorted.slice(-7).reverse().map(li).join('');

  // histogram
  const bins = 14, counts = Array(bins).fill(0);
  vals.forEach(([, v]) => { const i = Math.max(0, Math.min(bins - 1, Math.floor((v + R) / (2 * R) * bins))); counts[i]++; });
  const mx = Math.max(...counts, 1), bw = 300 / bins;
  $('hist').innerHTML = counts.map((n, i) => { const center = -R + (i + .5) * (2 * R / bins), h = n / mx * 112; return `<rect x="${i * bw + 1}" y="${126 - h}" width="${bw - 2}" height="${h}" fill="${rgb(color(center))}" stroke="#000"><title>${n} coins</title></rect>${n ? `<text x="${i * bw + bw / 2}" y="${120 - h}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="#9a968a">${n}</text>` : ''}`; }).join('') + `<line x1="150" x2="150" y1="0" y2="128" stroke="#f3efe4" stroke-opacity=".35" stroke-dasharray="3 3"/>`;
  $('hLo').textContent = '≤ -' + R + '%'; $('hHi').textContent = '≥ +' + R + '%';

  // chain table (from all shown, regardless of zoom)
  const all = shown(), by = {};
  all.forEach(c => { const g = chainOf(c); (by[g] = by[g] || []).push(c); });
  const rows = Object.entries(by).map(([g, cs]) => { const cp = cs.reduce((s, c) => s + c.market_cap, 0); return { g, n: cs.length, cap: cp, w: cs.reduce((s, c) => s + agg(c) * c.market_cap, 0) / (cp || 1) }; }).sort((a, b) => b.cap - a.cap);
  $('chainT').innerHTML = rows.map(r => { const col = color(r.w); return `<tr data-chain="${esc(r.g)}"><td>${esc(r.g)}</td><td class="r">${r.n}</td><td class="r">${fmtBig(r.cap)}</td><td class="r"><span class="chip" style="background:${rgb(col)};color:${light(col) ? '#0e0e0c' : '#f3efe4'}">${sign(r.w, 1)}</span></td></tr>`; }).join('');
}
$('chainT').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-chain]'); if (!tr) return;
  setCtl('group', 'chain'); S.zoom = tr.dataset.chain; saveHash(); layout();
  $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

function pushFeed() {
  const moves = coins.filter(c => lastPrice[c.id] && c.current_price).map(c => [c, (c.current_price / lastPrice[c.id] - 1) * 100]).filter(([, d]) => Math.abs(d) >= .3).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const feed = $('feed');
  if (feed.querySelector('.muted.small')) feed.innerHTML = '';
  const html = moves.length ? moves.map(([c, d]) => `<li data-id="${c.id}"><time>${t}</time><span>${esc(c.symbol.toUpperCase())}</span><b class="${cls(d)}">${d >= 0 ? '▲' : '▼'} ${sign(d)}</b></li>`).join('')
    : `<li><time>${t}</time><span class="muted">Quiet minute. No moves over 0.3%.</span></li>`;
  feed.insertAdjacentHTML('afterbegin', html);
  while (feed.children.length > 60) feed.lastChild.remove();
}

/* ---------- data ---------- */
function ingest(list, live) {
  const clean = list.filter(c => !/^(Binance-Peg|Wrapped|Bridged)/i.test(c.name)).map(c => ({ ...c, spark: c.spark || (c.sparkline_in_7d ? c.sparkline_in_7d.price : []) }));
  const first = !coins.length;
  prevShown = Object.fromEntries(coins.map(c => [c.id, c.current_price]));
  coins = clean;
  coins.forEach(c => { if (baseline[c.id] == null) baseline[c.id] = c.current_price; });
  if (!first && live) pushFeed();
  if (live) lastPrice = Object.fromEntries(coins.map(c => [c.id, c.current_price]));
  layout(); flashChanges();
  isLive = live;
  const el = $('liveDot'); el.className = 'live mono ' + (live ? 'ok' : 'off'); el.querySelector('span').textContent = live ? 'Live' : 'Snapshot';
  $('updated').textContent = live ? 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Snapshot ' + new Date(window.HEAT_FALLBACK_TIME).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
async function load() {
  if (loading) return; loading = true; lastLoad = Date.now();
  try {
    const r = await fetch(API); if (!r.ok) throw new Error(r.status);
    const d = await r.json(); if (!Array.isArray(d) || !d.length) throw new Error('empty');
    ingest(d, true);
  } catch (e) {
    if (!coins.length) ingest(window.HEAT_FALLBACK || [], false);
    else { const el = $('liveDot'); el.className = 'live mono off'; el.querySelector('span').textContent = 'Retrying'; }
  } finally { loading = false; nextAt = Date.now() + REFRESH * 1000; }
}
setInterval(() => {
  const s = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
  $('nextIn').textContent = loading ? 'Updating…' : `Next update in ${s}s`;
  $('ringFg').style.strokeDashoffset = (97.4 * (1 - s / REFRESH)).toFixed(1);
  if (s === 0 && !loading && !document.hidden) load();
}, 1000);
$('refresh').addEventListener('click', () => { if (Date.now() - lastLoad > 10000) load(); else $('nextIn').textContent = 'Just refreshed. Give it a few seconds.'; });

/* ---------- controls ---------- */
function setCtl(name, v) {
  S[name] = name === 'n' ? +v : v;
  document.querySelectorAll(`[data-ctl="${name}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(v)));
}
function saveHash() { history.replaceState(null, '', '#' + new URLSearchParams({ tf: S.tf, size: S.size, group: S.group, n: S.n, range: S.range, hideDoge: S.hideDoge ? 1 : 0 })); }
document.querySelectorAll('[data-ctl]').forEach(seg => {
  const name = seg.dataset.ctl;
  setCtl(name, S[name]);
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setCtl(name, b.dataset.v);
    if (name === 'group') S.zoom = null;
    saveHash(); layout();
  });
});
$('hideDoge').checked = S.hideDoge;
$('hideDoge').addEventListener('change', e => { S.hideDoge = e.target.checked; saveHash(); layout(); });
$('find').addEventListener('input', e => { S.find = e.target.value.trim().toLowerCase(); layout(); });
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if (S.zoom) { S.zoom = null; layout(); } } });

/* ---------- tooltip ---------- */
const tip = $('tip');
function mini(arr, up) {
  if (!arr || arr.length < 2) return '';
  const a = arr.filter((_, i) => i % 2 === 0), w = 226, h = 40, mn = Math.min(...a), mx = Math.max(...a), r = mx - mn || 1;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${up ? '#b8f53a' : '#ff5a4e'}" stroke-width="1.5" points="${a.map((v, i) => `${(i / (a.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ')}"/></svg>`;
}
$('map').addEventListener('pointermove', e => {
  const t = e.target.closest('.ht');
  if (!t || e.pointerType === 'touch') { tip.hidden = true; return; }
  const c = coins.find(x => x.id === t.dataset.id); if (!c) return;
  if (tip._id !== c.id) {
    tip._id = c.id;
    const live = baseline[c.id] ? (c.current_price / baseline[c.id] - 1) * 100 : null;
    tip.innerHTML = `<div class="tip-h"><img src="${c.image}" alt=""><div><b>${esc(c.name)}</b><small>$${esc(c.symbol.toUpperCase())} · #${c.market_cap_rank ?? '—'} · ${esc(chainOf(c))}</small></div></div>
      <div class="tip-p">${fmtPrice(c.current_price)}</div>
      <div class="tip-g">${['h1', 'd1', 'd7', 'd30'].map(k => `<div><span>${TF_LABEL[k]}</span><b class="${cls(c[K[k]])}">${sign(c[K[k]], 1)}</b></div>`).join('')}</div>
      ${mini(c.spark, (c[K.d7] ?? 0) >= 0)}
      <div class="tip-r"><span>Mkt cap <b>${fmtBig(c.market_cap)}</b></span><span>Vol <b>${fmtBig(c.total_volume)}</b></span></div>
      <div class="tip-r"><span>From ATH <b class="dn">${sign(c.ath_change_percentage, 0)}</b></span><span>Since open <b class="${cls(live)}">${sign(live)}</b></span></div>`;
  }
  tip.hidden = false;
  const tw = 270, th = tip.offsetHeight || 220;
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + tw > innerWidth) x = e.clientX - tw - 12;
  if (y + th > innerHeight) y = e.clientY - th - 12;
  tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
});
$('map').addEventListener('pointerleave', () => { tip.hidden = true; tip._id = null; });

/* ---------- modal ---------- */
document.addEventListener('click', e => { const t = e.target.closest('[data-id]'); if (t && !e.target.closest('.modal')) openModal(t.dataset.id); });
$('map').addEventListener('keydown', e => { if (e.key === 'Enter') { const t = e.target.closest('.ht'); if (t) openModal(t.dataset.id); } });
let lastFocus;
function openModal(id) {
  const c = coins.find(x => x.id === id); if (!c) return;
  tip.hidden = true; lastFocus = document.activeElement;
  $('mImg').src = c.image; $('mName').textContent = c.name;
  $('mSym').textContent = `$${c.symbol.toUpperCase()} · rank #${c.market_cap_rank ?? '—'} · ${chainOf(c)}`;
  $('mPrice').textContent = fmtPrice(c.current_price); $('mChg').innerHTML = `<span class="${cls(c[K.d1])}">${sign(c[K.d1])}</span> <span class="muted">24h</span>`;
  $('mChgs').innerHTML = ['h1', 'd1', 'd7', 'd30'].map(k => `<div><span class="label mono">${TF_LABEL[k]}</span><b class="${cls(c[K[k]])}">${sign(c[K[k]])}</b></div>`).join('');
  const g = [['Market cap', fmtBig(c.market_cap)], ['24h volume', fmtBig(c.total_volume)], ['Vol / cap', c.market_cap ? (c.total_volume / c.market_cap * 100).toFixed(1) + '%' : '—'],
    ['24h low', fmtPrice(c.low_24h)], ['24h high', fmtPrice(c.high_24h)], ['All-time high', fmtPrice(c.ath)],
    ['From ATH', `<span class="dn">${sign(c.ath_change_percentage)}</span>`], ['Circulating', fmtNum(c.circulating_supply)], ['Total supply', fmtNum(c.total_supply)]];
  $('mGrid').innerHTML = g.map(([k, v]) => `<div><span class="label mono">${k}</span><b>${v}</b></div>`).join('');
  $('mLink').href = `https://www.coingecko.com/en/coins/${c.id}`;
  drawChart(c);
  $('modal').hidden = false; document.body.style.overflow = 'hidden'; $('mClose').focus();
}
function closeModal() { $('modal').hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus && lastFocus.focus(); }
$('mClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function drawChart(c) {
  const svg = $('mChart'), data = c.spark, W = 600, H = 220;
  if (!data || data.length < 2) { svg.innerHTML = ''; return; }
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1;
  const X = i => i / (data.length - 1) * W, Y = v => H - 18 - (v - mn) / r * (H - 50);
  const col = data.at(-1) >= data[0] ? '#b8f53a' : '#ff5a4e';
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  svg.innerHTML = `<defs><linearGradient id="mg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${line}L${W},${H}L0,${H}Z" fill="url(#mg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/><line id="mX" y1="0" y2="${H}" stroke="#f3efe4" stroke-opacity=".4" vector-effect="non-scaling-stroke" visibility="hidden"/>`;
  const mt = $('mTip'), xl = svg.querySelector('#mX');
  svg.onpointermove = e => { const b = svg.getBoundingClientRect(), i = Math.round((e.clientX - b.left) / b.width * (data.length - 1)); if (i < 0 || i >= data.length) return;
    const hrs = Math.round((data.length - 1 - i) / (data.length - 1) * 168); xl.setAttribute('x1', X(i)); xl.setAttribute('x2', X(i)); xl.setAttribute('visibility', 'visible'); mt.hidden = false; mt.textContent = `${fmtPrice(data[i])} · ${hrs ? hrs + 'h ago' : 'now'}`; };
  svg.onpointerleave = () => { mt.hidden = true; xl.setAttribute('visibility', 'hidden'); };
}

load();
