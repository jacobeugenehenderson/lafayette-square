#!/usr/bin/env node
/**
 * make-sheet.mjs: the contact sheet for Jacob's review of the starter looks (draft 1).
 *
 *   node scratch/displays-looks/make-sheet.mjs   → scratch/displays-looks/contact-sheet.html (self-contained)
 *
 * The page samples each SVG ONE PIXEL PER BULB (exactly the runtime rule) and lights the bulbs on a cone, with the look's
 * motion running. ⚠️ The cone's proportions here are illustrative; the ring radius is an authored value on the display.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const M = JSON.parse(readFileSync(join(HERE, 'looks.json'), 'utf8'))
const looks = M.looks.map(L => ({ ...L, src: 'data:image/svg+xml;base64,' + readFileSync(join(HERE, L.file)).toString('base64') }))
const motionLabel = (m) => m.kind + (m.only ? ' · one colour' : '')

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monument Light Show Looks</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
:root {
  /* one visual world: a harbour town at night, lit by the tree */
  --night: #070a17; --panel: #0e1428; --rule: #1e2747; --ink: #eef0fa; --muted: #8d95b8; --gold: #ffc23a;
  --display: 'Fraunces', Georgia, serif; --body: 'IBM Plex Sans', system-ui, sans-serif; --mono: 'IBM Plex Mono', ui-monospace, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--night); color: var(--ink); font-family: var(--body); }
header { padding: 40px 24px 8px; max-width: 1240px; margin: 0 auto; display: grid; gap: 12px; }
h1 { font-family: var(--display); font-weight: 700; font-size: clamp(28px, 4vw, 44px); margin: 0; text-wrap: balance; }
h1 span { color: var(--gold); }
.lede { color: var(--muted); max-width: 68ch; line-height: 1.55; margin: 0; font-size: 15px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 0; padding: 0; list-style: none; }
.facts li { font-family: var(--mono); font-size: 12px; color: var(--ink); border: 1px solid var(--rule); border-radius: 999px; padding: 4px 10px; }
.grid { max-width: 1240px; margin: 0 auto; padding: 20px 24px 64px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; display: grid; grid-template-rows: auto auto 1fr; }
.card canvas.cone { width: 100%; aspect-ratio: 27 / 32; display: block; background: radial-gradient(ellipse at 50% 100%, #10183a 0%, #050713 70%); }
.card canvas.flat { width: 100%; aspect-ratio: 2 / 1; display: block; background: #000; border-top: 1px solid var(--rule); }
.meta { padding: 12px 14px 14px; display: grid; gap: 6px; }
.meta .row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.meta h2 { font-family: var(--display); font-weight: 500; font-size: 20px; margin: 0; }
.meta .chip { font-family: var(--mono); font-size: 11px; color: var(--gold); border: 1px solid #4a3a12; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.meta p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.num { font-family: var(--mono); font-size: 11px; color: var(--muted); }
footer { max-width: 1240px; margin: 0 auto; padding: 0 24px 48px; color: var(--muted); font-size: 13px; line-height: 1.55; }
</style></head>
<body>
<header>
  <h1>The Pilgrim Monument's looks · <span>draft 1</span></h1>
  <p class="lede">Twenty-six starter looks for the light show, each drawn as an SVG at the show's frame and lit here exactly as the tree would light it: one pixel of the drawing is one bulb. Above each card, the cone from the harbour side, motion running; below it, the frame unrolled, the crown at the top and the ground ring at the bottom. The first card is the season's white glow, for scale.</p>
  <ul class="facts"><li>192 colour strands × 96 bulbs</li><li>4 faces of 48 strands</li><li>glow: 64 white strands</li><li>black = bulbs off</li><li>cone proportions illustrative</li></ul>
</header>
<main class="grid" id="grid"></main>
<footer>Motions: still · fall · rise · spin · twinkle · pulse · strobe. "One colour" means the motion moves only that colour (Rudolph's nose, the candle flames, the holly berries). Transitions are the next sheet.</footer>
<script>
const LOOKS = ${JSON.stringify(looks)};
const FW = ${M.frame.w}, FH = ${M.frame.h}, FACES = ${M.frame.faces};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── The cone, from the harbour side. Tower 77 m; top square half-width 3.25 m; ring radius illustrative. ──
const H = 77, A = 3.25, R = 31, CW = 270, CH = 320, S = 3.3, GX = CW / 2, GY = CH - 26, ELEV = 0.22;
function coneGeometry(strands) {
  const pts = [];
  for (let c = 0; c < strands; c++) {
    const per = strands / FACES, k = Math.floor(c / per), u = ((c % per) + 0.5) / per * 2 - 1;
    const rot = -k * Math.PI / 2;                               // face k turns away from the viewer, clockwise from above
    const tx0 = u * A, tz0 = A, tx = tx0 * Math.cos(rot) - tz0 * Math.sin(rot), tz = tx0 * Math.sin(rot) + tz0 * Math.cos(rot);
    const th = ((c + 0.5) / strands - 0.5 / FACES) * 2 * Math.PI, bx = R * Math.sin(-th) * -1, bz = R * Math.cos(th);
    for (let j = 0; j < FH; j++) {
      const t = (j + 0.5) / FH, x = tx + (bx - tx) * t, z = tz + (bz - tz) * t, y = H * (1 - t) + 0.6;
      pts.push({ c: Math.floor(c * FW / strands), j, sx: GX + x * S, sy: GY - y * S + z * S * ELEV, z });
    }
  }
  pts.sort((p, q) => p.z - q.z);                                // far side first
  return pts;
}
const GEO = { 192: coneGeometry(192), 64: coneGeometry(64) };

function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// The motion: which frame pixel a bulb shows at time t, and how bright. Pure.
function sample(px, m, c, j, t) {
  let cc = c, jj = j;
  const sp = m.speed ?? 6;
  if (m.kind === 'fall') jj = ((j - Math.floor(t * sp)) % FH + FH) % FH;
  if (m.kind === 'rise') jj = ((j + Math.floor(t * sp)) % FH + FH) % FH;
  if (m.kind === 'spin') cc = ((c - Math.floor(t * sp)) % FW + FW) % FW;
  const o = (jj * FW + cc) * 4, r = px[o], g = px[o + 1], b = px[o + 2];
  let k = 1;
  const scoped = !m.only || (Math.abs(r - m._only[0]) + Math.abs(g - m._only[1]) + Math.abs(b - m._only[2]) < 90);
  if (scoped) {
    if (m.kind === 'twinkle') { const h = hash(jj * FW + cc), w = Math.sin(t * (2 + h * 3) + h * 40); k = w > 0.55 ? 1.6 : 0.55 + 0.35 * (w + 1) / 2; }
    if (m.kind === 'pulse') k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * (m.speed ?? 1)));
    if (m.kind === 'strobe') k = (t % 1.2) < 0.06 || ((t % 1.2) > 0.14 && (t % 1.2) < 0.2) ? 3 : 1;
  }
  return [r * k, g * k, b * k];
}

function drawCone(ctx, buf, px, m, t, strands, glow) {
  const img = buf.ctx.createImageData(CW, CH), d = img.data, geo = GEO[strands];
  for (const p of geo) {
    const [r, g, b] = glow ? glowColour(p, t) : sample(px, m, p.c, p.j, t);
    const dim = p.z < 0 ? 0.3 : 1, x = p.sx | 0, y = p.sy | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) continue;
      const o = (yy * CW + xx) * 4;
      d[o] = Math.max(d[o], Math.min(255, r * dim)); d[o + 1] = Math.max(d[o + 1], Math.min(255, g * dim)); d[o + 2] = Math.max(d[o + 2], Math.min(255, b * dim)); d[o + 3] = 255;
    }
  }
  buf.ctx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  // The tower, between the far strands and the near ones: a slim granite shaft.
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(buf.c, 0, 0);
  ctx.fillStyle = '#1a1d2a'; ctx.fillRect(GX - 3.6 * S * 0.5 * 2, GY - H * S, 3.6 * S * 2 * 0.5 * 2, H * S);
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(2px)'; ctx.globalAlpha = 0.45; ctx.drawImage(buf.c, 0, 0);
  ctx.filter = 'blur(8px)'; ctx.globalAlpha = 0.3; ctx.drawImage(buf.c, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1;
  // the near strands draw over the tower: re-lay only the front half
  const img2 = buf.ctx.createImageData(CW, CH), d2 = img2.data;
  for (const p of geo) {
    if (p.z < 0) continue;
    const [r, g, b] = glow ? glowColour(p, t) : sample(px, m, p.c, p.j, t), x = p.sx | 0, y = p.sy | 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) continue;
      const o = (yy * CW + xx) * 4; d2[o] = Math.min(255, r); d2[o + 1] = Math.min(255, g); d2[o + 2] = Math.min(255, b); d2[o + 3] = 255;
    }
  }
  buf.ctx.putImageData(img2, 0, 0);
  ctx.drawImage(buf.c, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}
function glowColour(p, t) { const h = hash(p.c * 131 + p.j), w = 0.8 + 0.2 * Math.sin(t * 1.5 + h * 30); return [255 * w, 214 * w, 150 * w]; }

function drawFlat(ctx, px, m, t) {
  const W = FW * 2, Hh = FH * 2, img = ctx.createImageData(W, Hh), d = img.data;
  for (let j = 0; j < FH; j++) for (let c = 0; c < FW; c++) {
    const [r, g, b] = sample(px, m, c, j, t), o = ((j * 2) * W + c * 2) * 4;
    d[o] = Math.min(255, r); d[o + 1] = Math.min(255, g); d[o + 2] = Math.min(255, b); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function card(L, i) {
  const el = document.createElement('article'); el.className = 'card';
  el.innerHTML = '<canvas class="cone" width="' + CW + '" height="' + CH + '"></canvas>' +
    (L.glow ? '' : '<canvas class="flat" width="' + FW * 2 + '" height="' + FH * 2 + '"></canvas>') +
    '<div class="meta"><div class="row"><h2></h2><span class="chip"></span></div><p></p><span class="num"></span></div>';
  el.querySelector('h2').textContent = L.name;
  el.querySelector('.chip').textContent = L.glow ? 'the glow' : L.motionLabel;
  el.querySelector('p').textContent = L.notes;
  el.querySelector('.num').textContent = L.glow ? '64 white strands × 96' : String(i).padStart(2, '0') + ' · ' + L.id + '.svg';
  document.getElementById('grid').appendChild(el);
  return el;
}

const items = [];
const glowCard = card({ name: 'The Glow', glow: true, notes: 'All season after dark: 64 warm-white strands, a Christmas tree. A show opens by turning this into the 192 colour strands below.' }, 0);
items.push({ el: glowCard, glow: true, ctx: glowCard.querySelector('.cone').getContext('2d') });

Promise.all(LOOKS.map((L, i) => new Promise(res => {
  const im = new Image(); im.onload = () => {
    const c = document.createElement('canvas'); c.width = FW; c.height = FH;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, FW, FH);
    const m = { ...L.motion }; if (m.only) m._only = hexRGB(m.only);
    const el = card({ ...L, motionLabel: ${JSON.stringify('')} + (m.kind + (m.only ? ' · one colour' : '')) }, i + 1);
    items[i + 1] = { el, px: x.getImageData(0, 0, FW, FH).data, m, ctx: el.querySelector('.cone').getContext('2d'), flat: el.querySelector('.flat').getContext('2d') };
    res();
  }; im.src = L.src;
}))).then(start);

function start() {
  const buf = { c: document.createElement('canvas') }; buf.c.width = CW; buf.c.height = CH; buf.ctx = buf.c.getContext('2d');
  const visible = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)), { rootMargin: '100px' });
  items.forEach(it => io.observe(it.el));
  const paint = (it, t) => { drawCone(it.ctx, buf, it.px, it.m, t, it.glow ? 64 : 192, it.glow); if (it.flat) drawFlat(it.flat, it.px, it.m, t); };
  items.forEach(it => paint(it, 1.3));                          // complete at rest: every card painted once
  if (reduce) return;
  let last = 0;
  const loop = (now) => {
    if (now - last > 66) { last = now; const t = now / 1000; items.forEach(it => { if (visible.has(it.el)) paint(it, t); }); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
</script>
</body></html>
`
writeFileSync(join(HERE, 'contact-sheet.html'), html)
console.log(`contact sheet: ${looks.length} looks → ${join(HERE, 'contact-sheet.html')}`)
