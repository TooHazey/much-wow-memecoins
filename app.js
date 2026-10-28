const API = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=meme-token&per_page=25&sparkline=true&price_change_percentage=24h,7d';
let coins = [], sortKey = 'market_cap', query = '';
const $ = id => document.getElementById(id);

const fmtPrice = p => {
  if (p == null) return '—';
  if (p >= 1) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 0.01) return '$' + p.toFixed(4);
  // compact small numbers: $0.0₅4990
  const s = p.toFixed(12).replace(/0+$/, '');
  const m = s.match(/^0\.(0+)(\d{1,4})/);
  if (m && m[1].length >= 3) return '$0.0' + String(m[1].length).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('') + m[2];
  return '$' + p.toPrecision(4);
};
const fmtBig = n => n == null ? '—' : '$' + Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const pct = v => v == null ? '<span class="muted">—</span>' : `<span class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;

function spark(arr, up) {
  if (!arr || arr.length < 2) return '';
  const w = 110, h = 32, min = Math.min(...arr), max = Math.max(...arr), r = max - min || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - (v - min) / r * (h - 4) - 2).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${up ? '#b8f53a' : '#ff5a4e'}" stroke-width="1.6" points="${pts}"/></svg>`;
}

function normalize(c) {
  return { ...c, spark: c.spark || (c.sparkline_in_7d ? c.sparkline_in_7d.price.filter((_, i) => i % 6 === 0) : []) };
}

function render() {
  const rows = $('rows');
  let list = coins.filter(c => !query || c.symbol.toLowerCase().includes(query) || c.name.toLowerCase().includes(query));
  list = [...list].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  if (!list.length) { rows.innerHTML = `<tr><td colspan="7" class="empty">No coin matches "${query}". Maybe forge it below.</td></tr>`; return; }
  rows.innerHTML = list.map(c => {
    const d7 = c.price_change_percentage_7d_in_currency;
    return `<tr>
      <td class="mono muted">${c.market_cap_rank ?? '—'}</td>
      <td><div class="coin"><img src="${c.image}" alt="" loading="lazy" width="28" height="28" onerror="this.outerHTML='<i class=ph>${c.symbol[0].toUpperCase()}</i>'"><span><b>${c.name}</b><small>${c.symbol}</small></span></div></td>
      <td class="r mono">${fmtPrice(c.current_price)}</td>
      <td class="r mono">${pct(c.price_change_percentage_24h_in_currency)}</td>
      <td class="r mono hide-sm">${pct(d7)}</td>
      <td class="r mono hide-sm">${fmtBig(c.market_cap)}</td>
      <td class="r hide-md">${spark(c.spark, (d7 ?? 0) >= 0)}</td></tr>`;
  }).join('');
}

function renderTicker() {
  const items = coins.map(c => {
    const v = c.price_change_percentage_24h_in_currency ?? 0;
    return `<span>$${c.symbol.toUpperCase()} ${fmtPrice(c.current_price)}<b class="${v >= 0 ? '' : 'dn'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</b></span>`;
  }).join('');
  $('ticker').innerHTML = items + items;
}

function renderStats() {
  const cap = coins.reduce((s, c) => s + (c.market_cap || 0), 0);
  const vol = coins.reduce((s, c) => s + (c.total_volume || 0), 0);
  const up = coins.filter(c => (c.price_change_percentage_24h_in_currency ?? 0) > 0).length;
  $('statCap').textContent = fmtBig(cap);
  $('statVol').textContent = fmtBig(vol);
  $('statUp').textContent = `${up} / ${coins.length}`;
}

function update(list, live) {
  coins = list.filter(c => !/^(Binance-Peg|Wrapped|Bridged)/i.test(c.name)).map(normalize);
  render(); renderTicker(); renderStats();
  $('status').textContent = live
    ? `Live · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `Snapshot from ${new Date(window.FALLBACK_TIME).toLocaleDateString()} (live feed unavailable)`;
}

async function load() {
  try {
    const r = await fetch(API);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    update(data, true);
  } catch (e) {
    if (!coins.length) update(window.FALLBACK || [], false);
  }
}

// skeleton
$('rows').innerHTML = Array.from({ length: 8 }, () => `<tr class="skel">${'<td>x</td>'.repeat(7)}</tr>`).join('');
load(); setInterval(load, 60000);

$('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); sortKey = b.dataset.sort; render();
}));

/* ---------- hero canvas: orbiting coins ---------- */
(() => {
  const cv = $('coinCanvas'), ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const labels = ['DOGE', 'PEPE', 'SHIB', 'BONK', 'WIF', 'FLOKI', 'PENGU', 'MOG'];
  let W, H, t = 0, mx = 0, my = 0;
  const resize = () => { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  addEventListener('resize', resize); resize();
  cv.parentElement.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width - .5; my = (e.clientY - r.top) / r.height - .5; });
  function coin(x, y, r, label, fill, spin) {
    const sx = Math.abs(Math.cos(spin)) * .85 + .15;
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(4, 5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .78, 0, Math.PI * 2); ctx.stroke();
    if (sx > .45) { ctx.fillStyle = '#000'; ctx.font = `700 ${r * .38}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1); }
    ctx.restore();
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2 + mx * 30, cy = H / 2 + my * 30, R = Math.min(W, H);
    ctx.strokeStyle = '#2b2b26'; ctx.lineWidth = 1;
    [.42, .3].forEach(k => { ctx.beginPath(); ctx.ellipse(cx, cy, R * k, R * k * .45, -.3, 0, Math.PI * 2); ctx.stroke(); });
    const items = labels.map((l, i) => {
      const ring = i % 2 ? .3 : .42, a = t * (i % 2 ? .5 : .32) + i * (Math.PI * 2 / labels.length) * 2;
      const x = Math.cos(a) * R * ring, y = Math.sin(a) * R * ring * .45;
      const rx = x * Math.cos(-.3) - y * Math.sin(-.3), ry = x * Math.sin(-.3) + y * Math.cos(-.3);
      return { l, x: cx + rx, y: cy + ry, z: Math.sin(a), i };
    }).sort((a, b) => a.z - b.z);
    const back = items.filter(o => o.z < 0), front = items.filter(o => o.z >= 0);
    const draw = o => coin(o.x, o.y, R * (.065 + (o.z + 1) * .018), o.l, o.i % 3 === 0 ? '#ff5fa2' : o.i % 3 === 1 ? '#f3efe4' : '#d4ff3a', t * 2 + o.i);
    back.forEach(draw);
    coin(cx, cy, R * .19, 'WOW', '#d4ff3a', t * .8);
    front.forEach(draw);
    t += .012;
    if (!reduce) requestAnimationFrame(frame);
  }
  document.fonts.ready.then(frame);
})();

/* ---------- coin forge ---------- */
const roads = ['Moon. Then Mars. Then lunch.', 'Q1: vibes. Q2: more vibes. Q3: ???', 'Get listed on a CEX nobody has heard of', 'Burn 50% of supply, tweet about it for a year', 'Become a dating app, somehow', 'Partner with a Discord server of 12 people'];
const slogans = ['Only up. Mostly.', 'Diamond paws.', 'Not a security, just a feeling.', 'Hold it like you mean it.', 'Wen lambo? Soon.', 'The fundamentals are the friends we made along the way.'];
const supplies = ['420,690,000,000', '1,000,000,000,000', '69,420,000,000,000', '8,888,888,888', '100,000,000,000,000,000'];
function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
$('forgeForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = $('mascot').value.trim() || ['sleepy raccoon', 'frog in a suit', 'cat with a laser', 'goose on a skateboard'][Math.floor(Math.random() * 4)];
  $('mascot').value = raw;
  const h = hash(raw.toLowerCase());
  const words = raw.replace(/[^a-z0-9 ]/gi, '').split(/\s+/).filter(Boolean);
  const name = words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') + (h % 2 ? ' Inu' : ' Coin');
  let tick = words.length > 1 ? words.map(w => w[0]).join('') + words.at(-1).slice(1, 3) : words[0].slice(0, 4);
  tick = tick.toUpperCase().slice(0, 5) || 'WOW';
  $('tcName').textContent = name;
  $('tcTicker').textContent = '$' + tick;
  $('tcLogo').textContent = tick[0];
  $('tcLogo').style.background = ['#ff5fa2', '#d4ff3a', '#f3efe4', '#7dd3fc'][h % 4];
  $('tcSupply').textContent = supplies[h % supplies.length];
  $('tcRoad').textContent = roads[(h >> 3) % roads.length];
  $('tcSlogan').textContent = slogans[(h >> 5) % slogans.length];
  const risk = 55 + (h % 45);
  $('tcRisk').style.width = risk + '%';
  $('tcRiskTxt').textContent = risk + '%';
  const card = $('tokenCard'); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
});
