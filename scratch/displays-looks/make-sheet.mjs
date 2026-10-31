#!/usr/bin/env node
/**
 * make-sheet.mjs: the contact sheet for Jacob's review of the starter looks (draft 2).
 *
 *   node scratch/displays-looks/make-sheet.mjs   → scratch/displays-looks/contact-sheet.html (self-contained)
 *
 * The page samples each look ONE PIXEL PER BULB (the runtime rule), layer by layer with each layer's motion, and lights
 * the bulbs on the monument: the pinnacle's four faces and the cone of strands from the top of the tower to the ground.
 * ⚠️ The cone's ring radius here is illustrative; it is an authored value on the display.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOSSIER, FT, placeholderStages } from '../../src/setpieces/pilgrimMonument.js'   // the monument's documented dimensions, never retyped

const HERE = dirname(fileURLToPath(import.meta.url))
// The strands hang from the BALCONY's edge (the ridge, 204 ft 4 in, 29 ft 6 in square); the pinnacle is the upper stage
// (21 ft 4 in square) standing on it, to the top (252 ft 7.5 in). Dossier §1/§5 via pilgrimMonument.js.
// The tower itself: the SAME stacked prisms the town draws (placeholderStages), in metres, half-widths.
const STAGES = placeholderStages().map(s => ({ name: s.name, h: s.sq * FT / 2, y0: Math.max(0, s.z0 * FT), y1: s.z1 * FT }))
const MON = { top: DOSSIER.topZ * FT, deck: DOSSIER.balcony.z * FT, pinHalf: DOSSIER.belfryTopSq * FT / 2, ridgeHalf: DOSSIER.balcony.sq * FT / 2 }
const DRAWER = join(HERE, '../../cartograph/data/provincetown/content/displays/monument-lights')
const M = JSON.parse(readFileSync(join(DRAWER, 'looks.json'), 'utf8'))
const uri = (file) => 'data:image/svg+xml;base64,' + readFileSync(join(DRAWER, file)).toString('base64')
const TRANSITIONS_SRC = readFileSync(join(HERE, '../../src/displays/lightShow/transitions.js'), 'utf8').replace(/^export /m, '')
// Each transition is shown between two looks that suit it: from → to.
const PAIRS = { cascade: ['santa', 'santas-hat'], 'rising-spiral': ['candy-cane', 'classic-tree'], iris: ['holly', 'stars'], curtain: ['gift-red', 'gift-pride'], sparkle: ['snowfall', 'snowflakes'], melt: ['snowman', 'snowfall'], twirl: ['peppermint', 'candy-cane'], 'blackout-bloom': ['menorah', 'dreidel'], shatter: ['ornaments', 'white-bulbs'], 'expanding-stripes': ['plaid', 'gingerbread'], chevron: ['progress-pride', 'trans'] }
const looks = M.looks.map(L => ({ ...L, layers: L.layers.map(l => ({ ...l, frames: l.frames.map(uri) })) }))

const TRANSITIONS_LIST_LEN = (TRANSITIONS_SRC.match(/\bid: '/g) || []).length
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
.lede { color: var(--muted); max-width: 70ch; line-height: 1.55; margin: 0; font-size: 15px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 0; padding: 0; list-style: none; }
.facts li { font-family: var(--mono); font-size: 12px; color: var(--ink); border: 1px solid var(--rule); border-radius: 999px; padding: 4px 10px; }
.tabs { display: flex; gap: 6px; margin-top: 2px; }
.tabs a { font: 500 14px var(--body); color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; padding: 4px 2px; margin-right: 14px; }
.tabs a[aria-current="page"] { color: var(--ink); border-color: var(--gold); }
.tabs a:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.intro { max-width: 1240px; margin: 0 auto; padding: 8px 24px 0; }
[hidden] { display: none !important; }
.switch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: var(--muted); }
.switch button { font: 500 13px var(--mono); color: var(--ink); background: transparent; border: 1px solid var(--rule); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.switch button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); }
.switch button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.grid { max-width: 1240px; margin: 0 auto; padding: 20px 24px 64px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
.card { min-width: 0; grid-template-columns: minmax(0, 1fr); background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; display: grid; grid-template-rows: auto auto 1fr; }
.card canvas.cone { width: 100%; aspect-ratio: 27 / 34; display: block; background: radial-gradient(ellipse at 50% 100%, #10183a 0%, #050713 70%); }
.card canvas.flat { width: 100%; aspect-ratio: 192 / 114; display: block; background: #000; border-top: 1px solid var(--rule); }
.meta { padding: 12px 14px 14px; display: grid; gap: 6px; align-content: start; }
.meta .row { flex-wrap: wrap; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.meta h2 { font-family: var(--display); font-weight: 500; font-size: 20px; margin: 0; }
.meta .chip { font-family: var(--mono); font-size: 11px; color: var(--gold); border: 1px solid #4a3a12; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
.meta p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.num { font-family: var(--mono); font-size: 11px; color: var(--muted); }
footer { max-width: 1240px; margin: 0 auto; padding: 0 24px 48px; color: var(--muted); font-size: 13px; line-height: 1.55; }
</style></head>
<body>
<header>
  <h1>The Pilgrim Monument's light show · <span>drafts</span></h1>
  <nav class="tabs" aria-label="Sheets"><a href="#looks" data-view="looks">Looks</a><a href="#transitions" data-view="transitions">Transitions</a></nav>
  <p class="lede">${looks.length} looks at the real tree's proportions, with the pinnacle lit too: a strip light at the foot of each of its four faces washes the stone in the look's colour, above the cone of strands that hangs from the balcony ridge beneath it to the ground. Each look is drawn as SVG layers at the show's frame and lit here exactly as the monument would light it, one pixel per bulb. Above each card, the monument from the harbour side, motion running, at the number of colour strands chosen below; under it, the full drawing, the pinnacle's colours in the band at the top. The real tree has 5 strands a side; switch between 2×, 3× and 192 to see what each resolution can carry.</p>
  <ul class="facts"><li>the real tree: 5 strands a side, 20 in all, ~3,000 bulbs</li><li>pinnacle: a strip light on each face</li><li>black = bulbs off</li><li>ring radius illustrative</li></ul>
  <div class="switch" role="group" aria-label="Colour strands for the show"><span>Show strands</span><button type="button" data-n="40">40 · 2×</button><button type="button" data-n="60" aria-pressed="true">60 · 3×</button><button type="button" data-n="192">192</button></div>
</header>
<main class="grid" id="grid" data-sheet="looks"></main>
<section class="intro" data-sheet="transitions"><p class="lede">${TRANSITIONS_LIST_LEN} transitions and the opening Transformation. Each card plays a pair of looks: the first look, the transition, the second, and the same transition back. Transitions marked <b>sparkle accent</b> glint at their moving edge, the dynamic moment: random bulbs, each on its own beat, never a hard line and never the whole tree. They are kit code: the operator picks them in the show strip, never draws them.</p></section>
<main class="grid" id="tgrid" data-sheet="transitions"></main>
<footer>Motions, one per layer: still · fall · rise · spin (round the tree) · spiral (round and up) · twinkle · pulse · strobe · fade (washing in over the layer beneath and back out), and three that move glyphs in place, drawn by the system: turn (the peppermints), swing (the bells), tumble (the snowflakes), build (the ribbon's lines wrapping on into a lattice, one by one). "One colour" means the motion touches only that colour. </footer>
<script>
${TRANSITIONS_SRC}
const PAIRS = ${JSON.stringify(PAIRS)};
const LOOKS = ${JSON.stringify(looks)};
const FW = ${M.frame.w}, FH = ${M.frame.h}, P = ${M.frame.pinH}, FACES = ${M.frame.faces}, CONE = FH - P;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── The monument, from its dossier (MON, injected): strands from the balcony ridge; the pinnacle above it, to the top. ──
const STAGES = ${JSON.stringify(STAGES)};
const FOOT = 6.1;   // the strands' foot ring, ~20 ft above the base (Provincetown's footHeightM)
const TOP = ${MON.top}, DECK = ${MON.deck}, A = ${MON.pinHalf}, RIDGE = ${MON.ridgeHalf}, R = 31, CW = 270, CH = 340, S = 3.2, GX = CW / 2, GY = CH - 24, ELEV = 0.22, VY = 0.42;
const view = (x, y, z) => { const xr = x * Math.cos(VY) - z * Math.sin(VY), zr = x * Math.sin(VY) + z * Math.cos(VY); return { sx: GX + xr * S, sy: GY - y * S + zr * S * ELEV, z: zr }; };
const onFace = (k, u, d) => { const rot = -k * Math.PI / 2, x0 = u * d, z0 = d; return [x0 * Math.cos(rot) - z0 * Math.sin(rot), x0 * Math.sin(rot) + z0 * Math.cos(rot)]; };
function geometry(strands) {
  const back = [], front = [], per = strands / FACES;
  for (let c = 0; c < strands; c++) {
    const k = Math.floor(c / per), u = ((c % per) + 0.5) / per * 2 - 1, [tx, tz] = onFace(k, u, RIDGE);   // from the ridge
    const th = ((c + 0.5) / strands - 0.5 / FACES) * 2 * Math.PI, bx = R * Math.sin(th), bz = R * Math.cos(th);
    for (let j = 0; j < CONE; j++) {
      const t = (j + 0.5) / CONE, p = view(tx + (bx - tx) * t, DECK + (FOOT - DECK) * t, tz + (bz - tz) * t);
      (p.z < 0 ? back : front).push({ c: Math.floor(c * FW / strands), row: P + j, sx: p.sx | 0, sy: p.sy | 0, lit: p.z < 0 ? 0.32 : 1 });
    }
  }
  return { back, front };
}
const GEO = { 20: geometry(20), 40: geometry(40), 60: geometry(60), 192: geometry(192) };
let SHOW = 60;   // colour strands for the show: 3x the real 20, ruled 2026-10-31

function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const wrapIn = (v, lo, n) => lo + (((v - lo) % n) + n) % n;

// What a bulb shows at time t: the top layer that has paint there, moved by that layer's motion. Pure.
function sample(look, c, row, t, top = look.layers.length - 1, enter = 1) {
  for (let li = top; li >= 0; li--) {
    const L = look.layers[li], m = L.motion, px = L.px[frameAt(L, t)], sp = m.speed ?? 6;
    let cc = c, rr = row;
    let lo = row < P ? 0 : P, n = row < P ? P : CONE;
    if (m.rows && row >= P) { lo = P + m.rows[0]; n = m.rows[1] - m.rows[0]; if (row < lo || row >= lo + n) continue; }   // a motion kept to part of the tree
    if (L.enter && enter !== 1) { rr = row - Math.round((1 - enter) * (CONE + 4)); if (rr < P || rr >= FH) continue; }   // a motion object below the ground (enter < 1), rising, or past its place and rising on (> 1)
    if (m.kind === 'fall') rr = wrapIn(row - Math.floor(t * sp), lo, n);
    if (m.kind === 'rise') rr = wrapIn(row + Math.floor(t * sp), lo, n);
    if (m.kind === 'spin' || m.kind === 'spiral') cc = ((c - Math.floor(t * sp)) % FW + FW) % FW;
    if (m.kind === 'spiral') rr = wrapIn(row + Math.floor(t * (m.rise ?? 3)), lo, n);
    const o = (rr * FW + cc) * 4;
    const alpha = px[o + 3] / 255;
    if (alpha < 0.02) continue;
    let r = px[o], g = px[o + 1], b = px[o + 2];
    if (alpha < 0.98 && li > 0) {                               // a layer part-way faded in blends over what is beneath it
      const u = sample(look, c, row, t, li - 1, enter); r = u[0] + (r - u[0]) * alpha; g = u[1] + (g - u[1]) * alpha; b = u[2] + (b - u[2]) * alpha;
    }
    let k = 1;
    const scoped = !m.only || (Math.abs(r - m._only[0]) + Math.abs(g - m._only[1]) + Math.abs(b - m._only[2]) < 90);
    if (scoped) {
      if (m.kind === 'twinkle') { const h = hash(rr * FW + cc), w = Math.sin(t * (2 + h * 3) + h * 40); k = w > 0.55 ? 1.6 : 0.55 + 0.35 * (w + 1) / 2; }
      if (m.kind === 'pulse') k = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * (m.speed ?? 1)));
      if (m.kind === 'strobe') k = (t % 1.2) < 0.06 || ((t % 1.2) > 0.14 && (t % 1.2) < 0.2) ? 3 : 1;
    }
    if (m.kind === 'fade') {                                    // the layer washes in over what is beneath it, and back out
      if (m.out) { const at = hash(row * FW + c + 7919) * m.out; if (t < at) return [r * k, g * k, b * k]; if (t < at + 0.12) return [255, 246, 228]; return li ? sample(look, c, row, t, li - 1, enter) : [0, 0, 0]; }
      const a = fadeAlpha(t, m.period ?? 6);
      if (a < 1) { const u = sample(look, c, row, t, li - 1, enter); return [u[0] + (r - u[0]) * a, u[1] + (g - u[1]) * a, u[2] + (b - u[2]) * a]; }
    }
    return [r * k, g * k, b * k];
  }
  return [0, 0, 0];
}
/** A source is a look, or anything with sample(c, row, t): a transition between two looks. */
const S_ = (src, c, row, t) => src.sample ? src.sample(c, row, t) : sample(src, c, row, t);
// As the engine: looped, or played ONCE and held; on a card a once-layer replays, with a 3 s hold at its end.
function frameAt(L, t) { const n = L.px.length; if (n === 1) return 0; if (L.once) { const u = t % (n / L.fps + 3); return Math.min(n - 1, Math.max(0, Math.floor(u * L.fps))); } const i = Math.floor(t * L.fps); return ((i % n) + n) % n; }
function fadeAlpha(t, period) { const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / period); return Math.min(1, Math.max(0, (s - 0.25) * 2)); }
const glowColour = (p, t) => { const h = hash(p.c * 131 + p.row), w = 0.8 + 0.2 * Math.sin(t * 1.5 + h * 30); return [255 * w, 214 * w, 150 * w]; };

function paintInto(img, pts, fn, avg) {
  const d = img.data;
  for (const p of pts) {
    const [r, g, b] = fn(p);
    avg[0] += r; avg[1] += g; avg[2] += b; avg[3]++;
    if (r + g + b < 6) continue;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = p.sx + dx, yy = p.sy + dy; if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) continue;
      const o = (yy * CW + xx) * 4;
      d[o] = Math.max(d[o], Math.min(255, r * p.lit)); d[o + 1] = Math.max(d[o + 1], Math.min(255, g * p.lit)); d[o + 2] = Math.max(d[o + 2], Math.min(255, b * p.lit)); d[o + 3] = 255;
    }
  }
}
/** Draws sets of strands ([geometry, bulb → colour]), the tower, and the pinnacle strips (pins(avg) → faces, or null). */
function drawSets(ctx, bufs, sets, pins) {
  const avg = [0, 0, 0, 0];   // the tree's mean colour: the one average glow that lights everything round it
  const ib = bufs.back.ctx.createImageData(CW, CH), jf = bufs.front.ctx.createImageData(CW, CH);
  for (const [G, fn] of sets) { paintInto(ib, G.back, fn, avg); paintInto(jf, G.front, fn, avg); }
  bufs.back.ctx.putImageData(ib, 0, 0); bufs.front.ctx.putImageData(jf, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(bufs.back.c, 0, 0);
  const pinFaces = pins ? pins(avg) : null;
  drawTower(ctx, avg[3] ? [avg[0] / avg[3], avg[1] / avg[3], avg[2] / avg[3]] : [0, 0, 0]);
  if (pinFaces) drawPinnacle(ctx, pinFaces);
  ctx.drawImage(bufs.front.c, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const [blur, a] of [[2, 0.45], [8, 0.3]]) { ctx.filter = 'blur(' + blur + 'px)'; ctx.globalAlpha = a; ctx.drawImage(bufs.back.c, 0, 0); ctx.drawImage(bufs.front.c, 0, 0); }
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawMonument(ctx, bufs, src, t, strands, glow) {
  const fn = glow ? (p) => glowColour(p, t) : (p) => S_(src, p.c, p.row, t);
  drawSets(ctx, bufs, [[GEO[strands], fn]], glow ? null : (avg) => pinnacleColours(src, t, avg));
}
// THE TRANSFORMATION, the show's opening: the 20 white strands fade as the colour strands spiral down from the ridge,
// their front strobing; the pinnacle's strips come up last. Then the reverse.
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
function drawTransformation(ctx, bufs, look, now) {
  const hold = 1.6, dur = 3.8, period = 2 * (hold + dur), u = now % period;
  const t = u < hold ? 0 : u < hold + dur ? (u - hold) / dur : u < 2 * hold + dur ? 1 : 1 - (u - 2 * hold - dur) / dur;
  const front = t * 3.1, kg = 1 - smooth((t - 0.15) / 0.6), kp = smooth((t - 0.7) / 0.3);
  const glowFn = (p) => glowColour(p, now).map(v => v * kg);
  const showFn = (p) => {
    const key = (p.row - P) / CONE * 2 + p.c / FW;
    const dd = Math.abs(key - front) * 14;                     // the front sparkles: random glints, thinning away from it
    if (t > 0 && t < 1 && dd < 4 && hash((p.row * FW + p.c) * 31 + Math.floor(now * 12 + hash(p.row * 977 + p.c) * 12)) < 0.5 * (1 - dd / 4)) return [255, 246, 228];
    return key < front ? sample(look, p.c, p.row, now) : [0, 0, 0];
  };
  drawSets(ctx, bufs, [[GEO[20], glowFn], [GEO[SHOW], showFn]], (avg) => pinnacleColours(look, now, avg).map(f => ({ k: f.k, L: f.L.map(v => v * kp), H: f.H.map(v => v * kp) })));
}
// The pinnacle is STRIP-LIT: a strip at the foot of each face, on the ridge, washing up the stone and fading toward the
// top. Its colour per face is that face's pinnacle region of the frame (lower half → the strip, upper half → the fade).
function pinnacleColours(src, t, avg) {
  const out = [];
  for (let k = 0; k < FACES; k++) {
    const lo = [0, 0, 0], hi = [0, 0, 0]; let nl = 0, nh = 0;
    for (let c = k * FW / FACES; c < (k + 1) * FW / FACES; c += 3) for (let row = 0; row < P; row += 2) {
      const v = S_(src, c, row, t), into = row >= P / 2 ? lo : hi; into[0] += v[0]; into[1] += v[1]; into[2] += v[2]; row >= P / 2 ? nl++ : nh++;
    }
    const L = lo.map(v => v / nl), H = hi.map(v => v / nh);
    avg[0] += L[0] * 40; avg[1] += L[1] * 40; avg[2] += L[2] * 40; avg[3] += 40;
    out.push({ k, L, H });
  }
  return out;
}
function drawPinnacle(ctx, faces) {
  const rgb = (c, m = 1) => 'rgb(' + c.map(v => Math.min(255, Math.round(v * m))).join(',') + ')';
  for (const { k, L, H } of faces) {
    const [ax, az] = onFace(k, -1, A + 0.02), [bx, bz] = onFace(k, 1, A + 0.02);
    const p0 = view(ax, DECK, az), p1 = view(bx, DECK, bz), p2 = view(bx, TOP, bz), p3 = view(ax, TOP, az);
    if ((p0.z + p1.z) / 2 <= 0) continue;                       // a face turned away
    const gr = ctx.createLinearGradient(0, (p0.sy + p1.sy) / 2, 0, (p2.sy + p3.sy) / 2);
    gr.addColorStop(0, rgb(L, 0.95)); gr.addColorStop(0.35, rgb(L.map((v, i) => (v + H[i]) / 2), 0.55)); gr.addColorStop(1, rgb(H, 0.18));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.strokeStyle = rgb(L, 1.3); ctx.lineWidth = 2; ctx.shadowColor = rgb(L); ctx.shadowBlur = 8;   // the strip itself
    ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy - 1); ctx.lineTo(p1.sx, p1.sy - 1); ctx.stroke(); ctx.restore();
  }
}
// The granite, block by block: each stage's sides that face the viewer and its top, washed by the tree's average glow.
function drawTower(ctx, glow) {
  const shade = (k) => { const c = [24, 27, 38].map((v, i) => Math.min(255, Math.round(v * k + glow[i] * 0.2 * k))); return 'rgb(' + c.join(',') + ')'; };
  for (const st of STAGES) {
    const h = st.h, ring = (y) => [[-h, y, h], [h, y, h], [h, y, -h], [-h, y, -h]].map(([x, yy, z]) => view(x, yy, z));
    const lo = ring(st.y0), hi = ring(st.y1);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, mx = (lo[i].z + lo[j].z) / 2;
      if (mx <= 0) continue;                                    // a side turned away from us
      const nz = Math.min(1, mx / (h * 1.0));
      ctx.fillStyle = shade(0.55 + 0.6 * nz);
      ctx.beginPath(); ctx.moveTo(lo[i].sx, lo[i].sy); ctx.lineTo(lo[j].sx, lo[j].sy); ctx.lineTo(hi[j].sx, hi[j].sy); ctx.lineTo(hi[i].sx, hi[i].sy); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = shade(1.25);
    ctx.beginPath(); hi.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath(); ctx.fill();
  }
}
function drawFlat(ctx, src, t) {
  const W = FW * 2, Hh = FH * 2, img = ctx.createImageData(W, Hh), d = img.data;
  for (let row = P; row < FH; row++) for (let c = 0; c < FW; c++) {   // the cone: one dot per bulb
    const [r, g, b] = S_(src, c, row, t), o = ((row * 2) * W + c * 2) * 4;
    d[o] = Math.min(255, r); d[o + 1] = Math.min(255, g); d[o + 2] = Math.min(255, b); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // the pinnacle: four strip lights, one per face, each washing up its band (no bulbs)
  for (const { k, L, H } of pinnacleColours(src, t, [0, 0, 0, 0])) {
    const x0 = k * W / FACES, rgb = (c, m) => 'rgb(' + c.map(v => Math.min(255, Math.round(v * m))).join(',') + ')';
    const gr = ctx.createLinearGradient(0, P * 2, 0, 0);
    gr.addColorStop(0, rgb(L, 0.95)); gr.addColorStop(0.35, rgb(L.map((v, i) => (v + H[i]) / 2), 0.55)); gr.addColorStop(1, rgb(H, 0.18));
    ctx.fillStyle = gr; ctx.fillRect(x0 + 1, 0, W / FACES - 2, P * 2);
    ctx.fillStyle = rgb(L, 1.3); ctx.fillRect(x0 + 1, P * 2 - 3, W / FACES - 2, 3);
  }
}
function motionLabel(look) {
  const parts = [];
  for (const l of look.layers) {
    const k = l.turn || l.motion.kind; if (k === 'still') continue;
    const s = k + (l.motion.only ? ' · one colour' : ''); if (!parts.includes(s)) parts.push(s);
  }
  return parts.join(' + ') || 'still';
}
function card(L, i) {
  const el = document.createElement('article'); el.className = 'card';
  el.innerHTML = '<canvas class="cone" width="' + CW + '" height="' + CH + '"></canvas>' +
    (L.glow ? '' : '<canvas class="flat" width="' + FW * 2 + '" height="' + FH * 2 + '"></canvas>') +
    '<div class="meta"><div class="row"><h2></h2><span class="chip"></span></div><p></p><span class="num"></span></div>';
  el.querySelector('h2').textContent = L.name;
  el.querySelector('.chip').textContent = L.glow ? 'the glow' : motionLabel(L);
  el.querySelector('p').textContent = L.notes;
  el.querySelector('.num').textContent = L.glow ? '20 white strands, as built' : String(i).padStart(2, '0') + ' · ' + L.id + ' · ' + L.layers.length + (L.layers.length > 1 ? ' layers' : ' layer');
  return el;
}
const loadPx = (src) => new Promise(res => { const im = new Image(); im.onload = () => {
  const c = document.createElement('canvas'); c.width = FW; c.height = FH; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(im, 0, 0, FW, FH); res(x.getImageData(0, 0, FW, FH).data); }; im.src = src; });

const items = [];
const byId = Object.fromEntries(LOOKS.map(L => [L.id, L]));
/** A transition card's source: from, the transition, to, and the same transition back, on a loop. */
function transitionSource(tr, from, to) {
  // The card holds the incoming look until its own animation is done (a fade played out, a once-played build), then
  // a breath more, before the way back (Jacob, 2026-10-31: "the chevron needs to wait long enough for the trans
  // animation to complete").
  const settle = Math.max(0, ...to.layers.map(L => L.motion.out ? L.motion.out + 0.2 : L.once ? L.frames.length / L.fps : 0));
  const hold = 1.6, holdB = Math.max(hold, settle + 1), dur = tr.seconds, period = hold + holdB + 2 * dur, E = { FW, FH, P, CONE, FACES, hash };
  return { sample(c, row, now) {
    const u = now % period, Af = (cc, rr, k = 1) => sample(from, cc, rr, now, undefined, k), Bf = (cc, rr, k = 1) => sample(to, cc, rr, u - hold - dur, undefined, k);   // the incoming look on its own clock, 0 as it lands
    if (u < hold) return Af(c, row, tr.fromEnter ?? 1);
    if (u < hold + dur) return tr.mix(Af, Bf, c, row, (u - hold) / dur, now, E);
    if (u < hold + holdB + dur) return Bf(c, row);
    const back = (u - hold - holdB - dur) / dur;
    return tr.mirror ? tr.mix(Af, Bf, c, row, 1 - back, now, E) : tr.mix(Bf, Af, c, row, back, now, E);
  } };
}
function tcard(name, chip, notes, num, flat) {
  const el = document.createElement('article'); el.className = 'card';
  el.innerHTML = '<canvas class="cone" width="' + CW + '" height="' + CH + '"></canvas>' + (flat ? '<canvas class="flat" width="' + FW * 2 + '" height="' + FH * 2 + '"></canvas>' : '') +
    '<div class="meta"><div class="row"><h2></h2><span class="chip"></span></div><p></p><span class="num"></span></div>';
  el.querySelector('h2').textContent = name; el.querySelector('.chip').textContent = chip; el.querySelector('p').textContent = notes; el.querySelector('.num').textContent = num;
  document.getElementById('tgrid').appendChild(el);
  return el;
}
const titems = [];
const glowCard = card({ name: 'The Glow', glow: true, notes: 'The real tree, all season after dark: 20 warm-white strands, five a side, from the balcony ridge to the ground; the pinnacle stays dark. A show opens by turning this into the colour strands and the lit pinnacle.' }, 0);
items.push({ el: glowCard, glow: true, ctx: glowCard.querySelector('.cone').getContext('2d') });
Promise.all(LOOKS.map(async (L, i) => {
  for (const l of L.layers) { l.px = await Promise.all(l.frames.map(loadPx)); if (l.motion.only) l.motion._only = hexRGB(l.motion.only); }
  const el = card(L, i + 1);
  items[i + 1] = { el, look: L, ctx: el.querySelector('.cone').getContext('2d'), flat: el.querySelector('.flat').getContext('2d') };
})).then(() => {
  const tf = byId['classic-tree'], tfEl = tcard('The Transformation', 'opening · sparkle accent', 'The show opens: the 20 white strands fade as the colour strands spiral down from the ridge, their front sparkling, and the pinnacle’s strips come up last. It reverses at the end.', 'the glow → Classic Tree', false);
  titems.push({ el: tfEl, ctx: tfEl.querySelector('.cone').getContext('2d'), transformation: tf });
  for (const tr of TRANSITIONS) {
    const [a, b] = PAIRS[tr.id], el = tcard(tr.name, tr.seconds + ' s' + (tr.accent ? ' · sparkle accent' : ''), tr.notes, byId[a].name + ' → ' + byId[b].name, true);
    titems.push({ el, src: transitionSource(tr, byId[a], byId[b]), ctx: el.querySelector('.cone').getContext('2d'), flat: el.querySelector('.flat').getContext('2d') });
  }
  start();
});

function start() {
  const mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; return { c, ctx: c.getContext('2d') }; };
  const bufs = { back: mk(), front: mk() };
  const grid = document.getElementById('grid');
  items.forEach(it => grid.appendChild(it.el));                 // the drawer's order, whatever loaded first
  const visible = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)), { rootMargin: '100px' });
  const all = items.concat(titems);
  all.forEach(it => io.observe(it.el));
  const paint = (it, t) => {
    if (it.transformation) return drawTransformation(it.ctx, bufs, it.transformation, t);
    const src = it.src || it.look;
    drawMonument(it.ctx, bufs, src, t, it.glow ? 20 : SHOW, it.glow); if (it.flat) drawFlat(it.flat, src, t);
  };
  const route = () => {
    const v = location.hash === '#transitions' ? 'transitions' : 'looks';
    document.querySelectorAll('[data-sheet]').forEach(el => { el.hidden = el.dataset.sheet !== v; });
    document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  };
  route(); addEventListener('hashchange', route);
  all.forEach(it => paint(it, 2.4));                            // complete at rest: every card painted once
  document.querySelectorAll('.switch button').forEach(b => b.addEventListener('click', () => {
    SHOW = +b.dataset.n;
    document.querySelectorAll('.switch button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    all.forEach(it => paint(it, performance.now() / 1000));
  }));
  if (reduce) return;
  let last = 0;
  const loop = (now) => {
    if (now - last > 66) { last = now; const t = now / 1000; all.forEach(it => { if (visible.has(it.el)) paint(it, t); }); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
</script>
</body></html>
`
writeFileSync(join(HERE, 'contact-sheet.html'), html)
console.log(`contact sheet: ${looks.length} looks → ${join(HERE, 'contact-sheet.html')}`)
