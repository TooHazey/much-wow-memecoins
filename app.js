document.documentElement.classList.add('js');
const CG = 'https://api.coingecko.com/api/v3';
const MARKETS = `${CG}/coins/markets?vs_currency=usd&category=meme-token&per_page=50&sparkline=true&price_change_percentage=1h,24h,7d,30d`;
const $ = id => document.getElementById(id);
const K = { h1: 'price_change_percentage_1h_in_currency', d1: 'price_change_percentage_24h_in_currency', d7: 'price_change_percentage_7d_in_currency', d30: 'price_change_percentage_30d_in_currency' };

let coins = [], prev = {}, sortKey = 'market_cap', query = '', showAll = false, heatKey = K.d1, isLive = false;

/* ---------- formatting ---------- */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function fmtPrice(p) {
  if (p == null) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 0.01) return '$' + p.toFixed(4);
  const s = p.toFixed(14);
  const m = s.match(/^0\.(0+)(\d{1,4})/);
  if (m && m[1].length >= 3) return '$0.0' + String(m[1].length).split('').map(d => SUB[d]).join('') + m[2];
  return '$' + p.toPrecision(4);
}
const fmtBig = n => n == null ? '—' : '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const fmtNum = n => n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const fmtUsd = n => '$' + (Math.abs(n) >= 1e6 ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0, minimumFractionDigits: n < 10 ? 2 : 0 }));
const sign = v => { const r = Math.round(v * 100) / 100 || 0; return (r >= 0 ? '+' : '') + r.toFixed(2) + '%'; };
const pct = v => v == null ? '<span class="muted">—</span>' : `<span class="${v >= 0 ? 'up' : 'dn'}">${sign(v)}</span>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgTag = (c, size, cls = '') => `<img class="${cls}" src="${c.image}" alt="" loading="lazy" width="${size}" height="${size}" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'ph',textContent:'${esc(c.symbol[0] || '?').toUpperCase()}'}))">`;

function spark(arr, up, w = 110, h = 32) {
  if (!arr || arr.length < 2) return '';
  const min = Math.min(...arr), max = Math.max(...arr), r = max - min || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - (v - min) / r * (h - 4) - 2).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${up ? '#b8f53a' : '#ff5a4e'}" stroke-width="1.6" points="${pts}"/></svg>`;
}
const normalize = c => ({ ...c, spark: c.spark || (c.sparkline_in_7d ? c.sparkline_in_7d.price : []) });
const bySym = s => coins.find(c => c.id === s);

/* ---------- board ---------- */
function render() {
  const rows = $('rows');
  let list = coins.filter(c => !query || c.symbol.toLowerCase().includes(query) || c.name.toLowerCase().includes(query));
  list = [...list].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  if (!query && !showAll) list = list.slice(0, 15);
  if (!list.length) { rows.innerHTML = `<tr><td colspan="9" class="empty">No coin matches "${esc(query)}". Maybe forge it below.</td></tr>`; return; }
  rows.innerHTML = list.map(c => {
    const d7 = c[K.d7], p0 = prev[c.id];
    const flash = p0 != null && p0 !== c.current_price ? (c.current_price > p0 ? 'flash-up' : 'flash-dn') : '';
    return `<tr data-id="${c.id}" class="${flash}" tabindex="0">
      <td class="mono muted hide-sm">${c.market_cap_rank ?? '—'}</td>
      <td><div class="coin">${imgTag(c, 28)}<span><b>${esc(c.name)}</b><small>${esc(c.symbol)}</small></span></div></td>
      <td class="r mono">${fmtPrice(c.current_price)}</td>
      <td class="r mono hide-md">${pct(c[K.h1])}</td>
      <td class="r mono">${pct(c[K.d1])}</td>
      <td class="r mono hide-sm">${pct(d7)}</td>
      <td class="r mono hide-md">${pct(c[K.d30])}</td>
      <td class="r mono hide-sm">${fmtBig(c.market_cap)}</td>
      <td class="r hide-md">${spark(c.spark.filter((_, i) => i % 3 === 0), (d7 ?? 0) >= 0)}</td></tr>`;
  }).join('');
  $('more').textContent = showAll ? 'Show top 15' : `Show all ${coins.length}`;
  $('more').hidden = !!query;
}

function renderMovers() {
  const valid = coins.filter(c => c[K.d1] != null && c.market_cap > 5e7);
  if (!valid.length) return;
  const top = valid.reduce((a, b) => b[K.d1] > a[K.d1] ? b : a);
  const bot = valid.reduce((a, b) => b[K.d1] < a[K.d1] ? b : a);
  const hot = valid.reduce((a, b) => (b.total_volume / b.market_cap) > (a.total_volume / a.market_cap) ? b : a);
  const card = (c, label, val) => `<button class="mover" data-id="${c.id}">${imgTag(c, 40)}<span><span class="label mono">${label}</span><b>${esc(c.name)}</b></span><span class="big ${val.cls}">${val.t}</span></button>`;
  $('movers').innerHTML =
    card(top, 'Top gainer · 24h', { t: sign(top[K.d1]), cls: 'up' }) +
    card(bot, 'Top loser · 24h', { t: sign(bot[K.d1]), cls: 'dn' }) +
    card(hot, 'Most traded vs size', { t: (hot.total_volume / hot.market_cap * 100).toFixed(0) + '% vol/cap', cls: '' });
}

function renderTicker() {
  const items = coins.slice(0, 30).map(c => {
    const v = c[K.d1] ?? 0;
    return `<span>$${esc(c.symbol.toUpperCase())} ${fmtPrice(c.current_price)}<b class="${v >= 0 ? '' : 'dn'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</b></span>`;
  }).join('');
  $('ticker').innerHTML = items + items;
}

let sectorData = null, globalCap = null;
function renderStats() {
  const meme = sectorData && sectorData.find(s => s.id === 'meme-token');
  const cap = meme ? meme.market_cap : coins.reduce((s, c) => s + (c.market_cap || 0), 0);
  const vol = meme ? meme.volume_24h : coins.reduce((s, c) => s + (c.total_volume || 0), 0);
  const up = coins.filter(c => (c[K.d1] ?? 0) > 0).length;
  $('statCap').textContent = fmtBig(cap);
  if (meme && meme.market_cap_change_24h != null) { const v = meme.market_cap_change_24h; $('statCapChg').innerHTML = `<span class="${v >= 0 ? 'up' : 'dn'}">${sign(v)}</span> <span class="muted">24h</span>`; }
  $('statVol').textContent = fmtBig(vol);
  $('statUp').textContent = `${up} / ${coins.length}`;
  if (globalCap) $('statShare').textContent = (cap / globalCap * 100).toFixed(2) + '%';
}

function setLive(state) {
  const el = $('liveDot');
  el.className = 'live mono ' + (state ? 'ok' : 'off');
  el.querySelector('span').textContent = state ? 'Live' : 'Snapshot';
}

function update(list, live) {
  const next = list.filter(c => !/^(Binance-Peg|Wrapped|Bridged)/i.test(c.name)).map(normalize);
  prev = Object.fromEntries(coins.map(c => [c.id, c.current_price]));
  coins = next; isLive = live;
  render(); renderMovers(); renderTicker(); renderStats(); renderTreemap(); fillRegretSelect(); if (!gameCoin) nextRound();
  setLive(live);
  $('status').textContent = live
    ? `Live · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
    : `Snapshot from ${new Date(window.FALLBACK_TIME).toLocaleDateString()} (live feed unavailable)`;
}

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }

async function loadMarkets() {
  try {
    const data = await getJSON(MARKETS);
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    update(data, true);
  } catch (e) {
    if (!coins.length) update(window.FALLBACK || [], false);
    else setLive(false);
  }
}
async function loadExtras() {
  try {
    const cats = await getJSON(`${CG}/coins/categories`);
    const ids = window.FALLBACK_SECTORS.map(s => s.id);
    sectorData = cats.filter(c => ids.includes(c.id) && c.market_cap);
  } catch (e) { sectorData = window.FALLBACK_SECTORS; }
  try { globalCap = (await getJSON(`${CG}/global`)).data.total_market_cap.usd; } catch (e) { globalCap = window.FALLBACK_GLOBAL; }
  renderSectors(); renderStats();
}

$('rows').innerHTML = Array.from({ length: 10 }, () => `<tr class="skel">${'<td>x</td>'.repeat(9)}</tr>`).join('');
loadMarkets().then(loadExtras);
setInterval(loadMarkets, 60000);

$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
document.querySelectorAll('.board .seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.board .seg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); sortKey = b.dataset.sort; render();
}));
$('more').addEventListener('click', () => { showAll = !showAll; render(); });
document.addEventListener('click', e => { const t = e.target.closest('[data-id]'); if (t && !e.target.closest('.modal')) openModal(t.dataset.id); });
$('rows').addEventListener('keydown', e => { if (e.key === 'Enter') { const t = e.target.closest('[data-id]'); if (t) openModal(t.dataset.id); } });

/* ---------- modal ---------- */
let lastFocus = null;
function openModal(id) {
  const c = bySym(id); if (!c) return;
  lastFocus = document.activeElement;
  $('mImg').src = c.image; $('mName').textContent = c.name; $('mSym').textContent = '$' + c.symbol.toUpperCase() + (c.market_cap_rank ? ` · rank #${c.market_cap_rank}` : '');
  $('mPrice').textContent = fmtPrice(c.current_price); $('mChg').innerHTML = pct(c[K.d1]) + ' <span class="muted">24h</span>';
  $('mLo').textContent = fmtPrice(c.low_24h); $('mHi').textContent = fmtPrice(c.high_24h);
  const pos = c.high_24h > c.low_24h ? (c.current_price - c.low_24h) / (c.high_24h - c.low_24h) : .5;
  $('mRng').style.left = `calc(${Math.max(0, Math.min(1, pos)) * 100}% - 2px)`;
  const g = [
    ['Market cap', fmtBig(c.market_cap)], ['24h volume', fmtBig(c.total_volume)], ['Vol / cap', c.market_cap ? (c.total_volume / c.market_cap * 100).toFixed(1) + '%' : '—'],
    ['All-time high', fmtPrice(c.ath)], ['From ATH', c.ath_change_percentage != null ? `<span class="dn">${sign(c.ath_change_percentage)}</span>` : '—'], ['ATH date', c.ath_date ? new Date(c.ath_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—'],
    ['Circulating', fmtNum(c.circulating_supply)], ['Total supply', fmtNum(c.total_supply)], ['30d change', pct(c[K.d30])],
  ];
  $('mGrid').innerHTML = g.map(([k, v]) => `<div><span class="label mono">${k}</span><b>${v}</b></div>`).join('');
  $('mLink').href = `https://www.coingecko.com/en/coins/${c.id}`;
  drawChart(c);
  $('modal').hidden = false; document.body.style.overflow = 'hidden'; $('mClose').focus();
}
function closeModal() { $('modal').hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }
$('mClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

function drawChart(c) {
  const svg = $('mChart'), data = c.spark, W = 600, H = 220;
  if (!data || data.length < 2) { svg.innerHTML = ''; return; }
  const min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const X = i => i / (data.length - 1) * W, Y = v => H - 18 - (v - min) / r * (H - 50);
  const up = data.at(-1) >= data[0], col = up ? '#b8f53a' : '#ff5a4e';
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  svg.innerHTML = `<defs><linearGradient id="mg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${W},${H}L0,${H}Z" fill="url(#mg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <line id="mX" y1="0" y2="${H}" stroke="#f3efe4" stroke-opacity=".4" vector-effect="non-scaling-stroke" visibility="hidden"/>`;
  const tip = $('mTip'), xl = svg.querySelector('#mX');
  svg.onpointermove = e => {
    const b = svg.getBoundingClientRect(), i = Math.round((e.clientX - b.left) / b.width * (data.length - 1));
    if (i < 0 || i >= data.length) return;
    const hrs = Math.round((data.length - 1 - i) / (data.length - 1) * 168);
    xl.setAttribute('x1', X(i)); xl.setAttribute('x2', X(i)); xl.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.textContent = `${fmtPrice(data[i])} · ${hrs ? hrs + 'h ago' : 'now'}`;
  };
  svg.onpointerleave = () => { tip.hidden = true; xl.setAttribute('visibility', 'hidden'); };
}

/* ---------- treemap ---------- */
function heatColor(v) {
  if (v == null) return '#2b2b26';
  const t = Math.max(-1, Math.min(1, v / 15));
  const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
  const n = [43, 43, 38], g = [184, 245, 58], r = [214, 52, 40];
  const c = t >= 0 ? mix(n, g, Math.pow(t, .7)) : mix(n, r, Math.pow(-t, .7));
  return `rgb(${c})`;
}
function renderTreemap() {
  const el = $('treemap'); if (!coins.length) return;
  const W = el.clientWidth, H = el.clientHeight;
  const items = coins.filter(c => c.market_cap).slice(0, 36);
  let rects;
  if (window.d3 && d3.treemap) {
    const root = d3.hierarchy({ children: items }).sum(d => d.market_cap || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([W, H]).tile(d3.treemapSquarify.ratio(1.2)).padding(0).round(true)(root);
    rects = root.leaves().map(l => ({ c: l.data, x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }));
  } else {
    const per = Math.ceil(Math.sqrt(items.length)), tw = W / per, th = H / Math.ceil(items.length / per);
    rects = items.map((c, i) => ({ c, x: (i % per) * tw, y: Math.floor(i / per) * th, w: tw, h: th }));
  }
  el.innerHTML = rects.map(({ c, x, y, w, h }) => {
    const v = c[heatKey], fs = Math.max(10, Math.min(56, Math.sqrt(w * h) / 5));
    const light = v != null && v > 6;
    const show = w > 46 && h > 30;
    return `<div class="tile ${light ? '' : 'dark'}" data-id="${c.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${heatColor(v)}" title="${esc(c.name)} ${v != null ? sign(v) : ''}">${show ? `<b style="font-size:${fs}px">${esc(c.symbol)}</b>${h > 52 ? `<span>${v != null ? sign(v) : '—'}</span>` : ''}${h > 90 && w > 110 ? `<span style="opacity:.7">${fmtBig(c.market_cap)}</span>` : ''}` : ''}</div>`;
  }).join('');
}
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(renderTreemap, 150); });
document.querySelectorAll('[data-heat]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-heat]').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); heatKey = b.dataset.heat; renderTreemap();
}));

/* ---------- sectors ---------- */
function renderSectors() {
  const list = (sectorData || []).filter(s => s.id !== 'meme-token').sort((a, b) => b.market_cap - a.market_cap).slice(0, 10);
  if (!list.length) return;
  const max = list[0].market_cap;
  $('sectorList').innerHTML = list.map(s => {
    const v = s.market_cap_change_24h;
    return `<div class="sec-row"><div class="nm">${esc(s.name.replace(' Ecosystem', ''))}<small>${(s.top_3_coins || []).map(u => `<img src="${u}" alt="" loading="lazy">`).join('')}</small></div>
      <div class="sec-bar"><i style="width:0" data-w="${(s.market_cap / max * 100).toFixed(1)}"></i></div>
      <span class="mono cap">${fmtBig(s.market_cap)}</span><span class="mono chg ${v >= 0 ? 'up' : 'dn'}">${v != null ? sign(v) : ''}</span></div>`;
  }).join('');
  const go = () => document.querySelectorAll('.sec-bar i').forEach(i => i.style.width = i.dataset.w + '%');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { go(); io.disconnect(); } }, { threshold: .2 });
    io.observe($('sectorList'));
  } else go();
}

/* ---------- lifecycle ---------- */
const STAGES = [
  { x: 40, y: 320, n: 'Launch', d: 'Someone deploys a token in seconds on a launchpad. A ticker, a picture and a Telegram link are all it takes. Snipers and bots buy in the first few blocks.' },
  { x: 160, y: 290, n: 'Bonding curve', d: 'Early buyers move the price up the curve. Most tokens never finish this stage and quietly die with a few thousand dollars in volume.' },
  { x: 290, y: 240, n: 'Migration', d: 'The curve fills and liquidity moves to a regular DEX. Charts appear on screeners, and the coin gets discovered by a much wider audience.' },
  { x: 430, y: 130, n: 'Hype wave', d: 'Influencers post about it, crypto Twitter picks it up, and new buyers arrive. Price can rise 10–100x in days. This is the stage that makes headlines.' },
  { x: 540, y: 40, n: 'ATH', d: 'The all-time high. Every new buyer is betting someone else will pay more. Insiders and early wallets usually start selling here.' },
  { x: 660, y: 230, n: 'Dump', d: 'Selling pressure exceeds new demand. The price can fall 70–90% fast. Holders who bought late become bagholders.' },
  { x: 770, y: 190, n: 'Dead-cat bounce', d: 'A short relief rally pulls in dip buyers. It usually fades once the remaining holders start selling again.' },
  { x: 940, y: 270, n: 'Cult or zero', d: 'Most coins drift toward zero. A rare few, like DOGE, keep a lasting community and become cultural landmarks.' },
];
function buildCycle() {
  const pts = STAGES.map(s => [s.x, s.y]);
  let d = `M0,340 L${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  d += ' L1000,285';
  $('cycleLine').setAttribute('d', d);
  $('cycleArea').setAttribute('d', d + ' L1000,360 L0,360 Z');
  $('cycleDots').innerHTML = STAGES.map((s, i) => `<g class="cdot" data-i="${i}" tabindex="0" role="button" aria-label="${s.n}"><circle cx="${s.x}" cy="${s.y}" r="11"/><text x="${s.x}" y="${s.y - 22}">${i + 1}</text></g>`).join('');
  const pick = i => {
    document.querySelectorAll('.cdot').forEach(g => g.classList.toggle('on', +g.dataset.i === i));
    $('cycleInfo').innerHTML = `<strong>${String(i + 1).padStart(2, '0')} ${STAGES[i].n}</strong><p>${STAGES[i].d}</p>`;
  };
  $('cycleDots').addEventListener('click', e => { const g = e.target.closest('.cdot'); if (g) pick(+g.dataset.i); });
  $('cycleDots').addEventListener('keydown', e => { const g = e.target.closest('.cdot'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(+g.dataset.i); } });
  pick(3);
}
buildCycle();

/* ---------- rug checklist ---------- */
$('rugForm').addEventListener('change', () => {
  const s = Math.min(100, [...document.querySelectorAll('#rugForm input:checked')].reduce((a, i) => a + +i.value, 0));
  $('rugBar').style.width = s + '%'; $('rugScore').textContent = s;
  $('rugText').textContent = s === 0 ? 'Nothing ticked yet. Still not financial advice.'
    : s < 25 ? 'Some yellow flags. Size your bet small.'
    : s < 50 ? 'Sketchy. Many coins like this end up as rug pulls.'
    : s < 75 ? 'High risk. You would likely be exit liquidity.'
    : 'This looks like a rug pull. Walk away.';
});

/* ---------- pump or dump ---------- */
let gameCoin = null, score = 0, streak = 0, best = +(localStorage.getItem('mw-best') || 0), locked = false;
$('gBest').textContent = best;
function nextRound() {
  const pool = coins.filter(c => c[K.d1] != null && c !== gameCoin);
  if (!pool.length) return;
  gameCoin = pool[Math.floor(Math.random() * pool.length)];
  $('gImg').src = gameCoin.image; $('gImg').alt = gameCoin.name;
  $('gName').textContent = gameCoin.name;
  $('gMeta').textContent = `$${gameCoin.symbol.toUpperCase()} · now ${fmtPrice(gameCoin.current_price)} · cap ${fmtBig(gameCoin.market_cap)}`;
  $('gRes').innerHTML = '&nbsp;'; locked = false;
  document.querySelectorAll('[data-guess]').forEach(b => b.disabled = false);
}
document.querySelectorAll('[data-guess]').forEach(b => b.addEventListener('click', () => {
  if (locked || !gameCoin) return; locked = true;
  const v = gameCoin[K.d1], ok = (b.dataset.guess === 'up') === (v >= 0), g = $('game');
  if (ok) { score++; streak++; } else streak = 0;
  if (streak > best) { best = streak; localStorage.setItem('mw-best', best); }
  $('gScore').textContent = score; $('gStreak').textContent = streak; $('gBest').textContent = best;
  $('gRes').innerHTML = `${ok ? 'Correct.' : 'Wrong.'} ${esc(gameCoin.symbol.toUpperCase())} ${v >= 0 ? 'pumped' : 'dumped'} <span class="${v >= 0 ? 'up' : 'dn'}">${sign(v)}</span> in 24h.`;
  g.classList.remove('win', 'lose'); void g.offsetWidth; g.classList.add(ok ? 'win' : 'lose');
  document.querySelectorAll('[data-guess]').forEach(x => x.disabled = true);
  setTimeout(nextRound, 1600);
}));

/* ---------- regret calculator ---------- */
function fillRegretSelect() {
  const sel = $('rCoin'), cur = sel.value || 'dogecoin';
  sel.innerHTML = coins.map(c => `<option value="${c.id}">${esc(c.name)} ($${esc(c.symbol.toUpperCase())})</option>`).join('');
  sel.value = coins.some(c => c.id === cur) ? cur : coins[0]?.id;
  calcRegret();
}
function calcRegret() {
  const c = bySym($('rCoin').value), amt = Math.max(0, +$('rAmt').value || 0);
  if (!c) return;
  const row = (label, mult, cls = '') => mult == null || !isFinite(mult) ? '' :
    `<li class="${cls}"><span>${label}</span><b class="${mult >= 1 ? 'up' : 'dn'}">${fmtUsd(amt * mult)} <span class="muted">(${mult >= 10 ? mult.toFixed(0) : mult.toFixed(2)}x)</span></b></li>`;
  const back = p => p == null ? null : 1 / (1 + p / 100);
  $('rOut').innerHTML =
    row('…at the all-time low', c.atl_change_percentage != null ? 1 + c.atl_change_percentage / 100 : null, 'hero-row') +
    row('…30 days ago', back(c[K.d30])) +
    row('…7 days ago', back(c[K.d7])) +
    row('…24 hours ago', back(c[K.d1])) +
    row('…at the all-time high', c.ath_change_percentage != null ? 1 + c.ath_change_percentage / 100 : null, 'hero-row');
}
$('rCoin').addEventListener('change', calcRegret);
$('rAmt').addEventListener('input', calcRegret);

/* ---------- glossary ---------- */
const GLOSS = [
  ['Ape', 'To buy fast and hard, usually without research. "I aped in at launch."'],
  ['Rug pull', 'When the developers drain liquidity or dump their supply and disappear, leaving the token worthless.'],
  ['Diamond hands', 'Holding through brutal drawdowns without selling. Sometimes conviction, sometimes denial.'],
  ['Paper hands', 'Selling at the first sign of trouble. Usually said as an insult, though it\'s often the smart move.'],
  ['WAGMI / NGMI', '"We\'re all gonna make it" and "not gonna make it." Optimism and doom, in four letters each.'],
  ['LFG', '"Let\'s f***ing go." Posted at launches, pumps and, ironically, at crashes.'],
  ['Jeet', 'Slang for a trader who sells quickly for small profits, which annoys the holders.'],
  ['Exit liquidity', 'The late buyers whose purchases let early holders cash out. Don\'t be exit liquidity.'],
  ['Bonding curve', 'A pricing formula where each purchase raises the price. Used by launchpads like pump.fun.'],
  ['Market cap', 'Price × circulating supply. A cheap price per token says nothing about whether a coin is cheap.'],
  ['FDV', 'Fully diluted valuation: price × the maximum supply. Shows what the coin would be worth if every token were unlocked.'],
  ['Honeypot', 'A contract that lets you buy but quietly blocks you from selling.'],
  ['KOL', '"Key opinion leader," which usually means a paid influencer. Their promotion often comes before a dump.'],
  ['Dev sold', 'The developer dumped their tokens. Often the end of the story.'],
  ['Sniper', 'A bot that buys in the very first block of a launch, before regular buyers get a chance.'],
  ['Bagholder', 'Someone still holding a token that has crashed, hoping it comes back.'],
  ['CT', 'Crypto Twitter, where most meme coin narratives start and end.'],
  ['Mooning', 'Price going vertical. The opposite is when the coin "rugs" or "bleeds."'],
];
function renderGloss(q = '') {
  const l = GLOSS.filter(([t, d]) => (t + d).toLowerCase().includes(q));
  $('gloss').innerHTML = l.length ? l.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('') : `<div class="none">No slang found. Make it up and it'll be on CT by Friday.</div>`;
}
renderGloss();
$('gSearch').addEventListener('input', e => renderGloss(e.target.value.trim().toLowerCase()));

/* ---------- coin forge ---------- */
const roads = ['Moon. Then Mars. Then lunch.', 'Q1: vibes. Q2: more vibes. Q3: ???', 'Get listed on an exchange nobody has heard of', 'Burn 50% of supply, then tweet about it for a year', 'Become a dating app, somehow', 'Partner with a 12-person Discord server', 'Buy a billboard, then sell the billboard'];
const slogans = ['Only up. Mostly.', 'Diamond paws.', 'Not a security, just a feeling.', 'Hold it like you mean it.', 'Wen lambo? Soon.', 'The fundamentals are the friends we made along the way.', 'Number go up technology.'];
const supplies = ['420,690,000,000', '1,000,000,000,000', '69,420,000,000,000', '8,888,888,888', '100,000,000,000,000,000'];
const chains = ['Solana', 'Ethereum', 'Base', 'BNB Chain', 'TON', 'Sui'];
const TOK = [['Community', '#d4ff3a'], ['Dev wallet', '#ff5fa2'], ['Liquidity', '#f3efe4'], ['"Marketing"', '#7dd3fc']];
function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
let forged = null;
$('forgeForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = $('mascot').value.trim() || ['sleepy raccoon', 'frog in a suit', 'cat with a laser', 'goose on a skateboard'][Math.floor(Math.random() * 4)];
  $('mascot').value = raw;
  const h = hash(raw.toLowerCase());
  const words = raw.replace(/[^a-z0-9 ]/gi, '').split(/\s+/).filter(Boolean);
  if (!words.length) words.push('wow');
  const name = words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') + (h % 2 ? ' Inu' : ' Coin');
  let tick = words.length > 1 ? words.map(w => w[0]).join('') + words.at(-1).slice(1, 3) : words[0].slice(0, 4);
  tick = tick.toUpperCase().slice(0, 5) || 'WOW';
  const dev = 5 + (h >> 7) % 40, liq = 10 + (h >> 11) % 25, mkt = 5 + (h >> 13) % 15, com = 100 - dev - liq - mkt;
  const parts = [com, dev, liq, mkt];
  $('tcName').textContent = name; $('tcTicker').textContent = '$' + tick; $('tcLogo').textContent = tick[0];
  $('tcLogo').style.background = ['#ff5fa2', '#d4ff3a', '#f3efe4', '#7dd3fc'][h % 4];
  $('tcSupply').textContent = supplies[h % supplies.length];
  $('tcChain').textContent = chains[(h >> 2) % chains.length];
  $('tcRoad').textContent = roads[(h >> 3) % roads.length];
  $('tcSlogan').textContent = slogans[(h >> 5) % slogans.length];
  $('tcTok').outerHTML = `<div id="tcTok"><div class="tok">${parts.map((p, i) => `<i style="width:${p}%;background:${TOK[i][1]}"></i>`).join('')}</div><div class="tok-key">${parts.map((p, i) => `<span><em style="background:${TOK[i][1]}"></em>${TOK[i][0]} ${p}%</span>`).join('')}</div></div>`;
  const risk = Math.min(99, 40 + dev + (h % 15));
  $('tcRisk').style.width = risk + '%'; $('tcRiskTxt').textContent = risk + '%';
  forged = { name, tick, slogan: $('tcSlogan').textContent, chain: $('tcChain').textContent };
  $('copyCoin').disabled = false; $('copyCoin').textContent = 'Copy shill post';
  const card = $('tokenCard'); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
});
$('copyCoin').addEventListener('click', async () => {
  if (!forged) return;
  const t = `$${forged.tick} just launched on ${forged.chain}. ${forged.name}: ${forged.slogan} Dev is (probably) based. Not financial advice.`;
  try { await navigator.clipboard.writeText(t); $('copyCoin').textContent = 'Copied'; } catch { $('copyCoin').textContent = t.slice(0, 40) + '…'; }
});

/* ---------- hero coin rain ---------- */
(() => {
  const cv = $('rain'), ctx = cv.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let W, H, drops = [];
  const cols = ['#d4ff3a', '#ff5fa2', '#f3efe4'];
  const resize = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    drops = Array.from({ length: Math.round(W / 45) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 3 + Math.random() * 7, v: .3 + Math.random() * .9, s: Math.random() * 6, c: cols[Math.floor(Math.random() * 3)] })); };
  addEventListener('resize', resize); resize();
  let vis = true; new IntersectionObserver(e => vis = e[0].isIntersecting).observe(cv);
  (function f() {
    if (vis) {
      ctx.clearRect(0, 0, W, H);
      for (const d of drops) {
        d.y += d.v; d.s += .04; if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
        ctx.save(); ctx.translate(d.x, d.y); ctx.scale(Math.abs(Math.cos(d.s)) * .8 + .2, 1);
        ctx.globalAlpha = .55; ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    requestAnimationFrame(f);
  })();
})();

/* ---------- reveal + nav ---------- */
if ('IntersectionObserver' in window) {
  const els = document.querySelectorAll('.sec-head, .table-wrap, .treemap, .sector-list, .chains, .banner, .timeline li, .cycle-wrap, .guide-grid, .cards, .panel, .gloss, .faq-list, .movers');
  els.forEach(e => e.classList.add('reveal'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
  const links = [...document.querySelectorAll('.nav nav a')];
  const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); s && so.observe(s); });
}
