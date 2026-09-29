// leaf-generator.mjs — DRAW A SPECIES' LEAF FROM ITS DOSSIER, EVERY CHANNEL FROM ONE SHAPE.
//
// A leaf pack made by code instead of a camera. The species' dossier carries a `leafModel` block
// (the family + each parameter as a [lo, hi] RANGE) and its `leaf.season` colour anchors; every
// variant is drawn from those ranges with its own seed. Because the shape is known, every channel
// comes out of it consistently: alpha, unlit albedo per season, and a tangent-space normal
// (veins sunk into the upper face, the blade domed, a little wave). The stalk end sits at a
// declared point, so the Salon re-skin can turn each leaf until its stalk meets its twig.
//
// ⛔ No fallbacks: a dossier with no leafModel, or a family this file does not draw, throws.
// Families drawn today: 'palmate-lobed' (v2, veins first — 2026-09-28).
//
//   node arborist/leaf-generator.mjs --species acer_rubrum --pack red_maple
// Writes public/textures/leaves/shapes/<pack>/{shape.png, fall.png, normal.png, meta.json}.
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SHAPES = path.join(REPO, 'public/textures/leaves/shapes')
const DOSSIERS = path.join(__dirname, 'dossiers')

const SS = 2              // supersample factor for the draw
let CELL = 512            // shipped cell edge, px (the pack); a close-up render may raise it
let R = CELL * SS         // draw resolution per cell
const STALK = [0.5, 0.985] // where the stalk END sits in every cell, glTF UV (v grows down)

// ── deterministic randomness ──────────────────────────────────────────────
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const draw = (rng, v) => Array.isArray(v) ? v[0] + (v[1] - v[0]) * rng() : v
function valueNoise2(seed) {
  const g = new Float32Array(257 * 257); const r = mulberry32(seed)
  for (let i = 0; i < g.length; i++) g[i] = r()
  const at = (x, y) => g[((y & 255) * 257) + (x & 255)]
  const sm = t => t * t * (3 - 2 * t)
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi)
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
}
const fbm = (n, x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2 } return s }

// ── colour ────────────────────────────────────────────────────────────────
const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const M = Math.max(r, g, b), m = Math.min(r, g, b), l = (M + m) / 2
  if (M === m) return [0, 0, l]
  const d = M - m, s = l > 0.5 ? d / (2 - M - m) : d / (M + m)
  const h = M === r ? (g - b) / d + (g < b ? 6 : 0) : M === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function hsl2rgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  return s === 0 ? [l * 255, l * 255, l * 255] : [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}
const shift = (c, dh, ds, dl) => { const [h, s, l] = rgb2hsl(c); return hsl2rgb([h + dh, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(1, l + dl))]) }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// ── the palmate-lobed family — THE VEINS BUILD THE LEAF ────────────────────
// Leaf space: blade base (where the stalk meets the blade) at the origin, +y along the midrib,
// the longest lobe = length 1. Built the way a leaf is (tips first, flowing back):
//   1. LOBE TIPS — the main veins' ends. All main veins leave from the base.
//   2. SINUSES between neighbouring lobes, and the BASE sinus at the stalk.
//   3. Each LOBE EDGE runs sinus → tip; TOOTH TIPS sit along it; between two teeth a notch.
//      Some teeth carry a smaller second tooth (doubly serrate).
//   4. Every tooth tip is a vein's end: a secondary leaves its main vein at the species' angle
//      and runs to it; a minor tooth's vein leaves that secondary. The MARGIN is the curve
//      through those ends — the outline is derived, never drawn on its own.
//   5. Widths by the PIPE RULE: a vein's width ∝ √(tips it serves) wherever you cut it;
//      the stalk carries them all.
// Returns the outline, the veins (points + per-point width), the junctions, and the stalk.
function palmateLobed(p, rng) {
  const deg = Math.PI / 180
  const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r]
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]]
  const mul = (a, k) => [a[0] * k, a[1] * k], len = a => Math.hypot(a[0], a[1])
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const jit = (amt) => (rng() - 0.5) * 2 * amt
  const irr = draw(rng, p.irregularity)

  // 1. lobe tips
  const asym = 1 + jit(draw(rng, p.asymmetry))
  const sideAng = draw(rng, p.side_lobe_angle), sideLen = draw(rng, p.side_lobe_length)
  const lobes = [{ ang: 90, len: 1 }, { ang: 90 - sideAng, len: sideLen * asym }, { ang: 90 + sideAng, len: sideLen / asym }]
  if (rng() < p.basal_lobe_chance) {
    const bA = draw(rng, p.basal_lobe_angle), bL = draw(rng, p.basal_lobe_length)
    lobes.push({ ang: 90 - bA, len: bL * asym }, { ang: 90 + bA, len: bL / asym })
  }
  lobes.sort((a, b) => a.ang - b.ang)
  for (const l of lobes) { l.a = (l.ang + jit(3 * irr / 0.05)) * deg; l.len *= 1 + jit(irr); l.tip = P(l.a, l.len) }

  // 2. sinuses — between neighbours, and the base sinus at the stalk (below the origin = cordate)
  const sinusDepth = draw(rng, p.sinus_depth)
  const sinus = []
  for (let i = 0; i < lobes.length - 1; i++) {
    const A = lobes[i], B = lobes[i + 1]
    sinus.push(P((A.a + B.a) / 2, sinusDepth * Math.min(A.len, B.len) * (1 + jit(irr * 2))))
  }
  const baseSinus = [0, -draw(rng, p.base_depth)]

  // 3 + 4. EDGES, recursively: lobe → SUB-POINTS → teeth, one rule at three scales.
  // Each lobe edge (sinus → lobe tip) carries a few SUB-POINTS — small lobes of their own, each
  // with a secondary vein to its tip; between them the margin is a smooth concave SCALLOP (a
  // sinus at the smaller scale). Serration, if the species has any, rides the scallops: each
  // tooth's vein leaves the secondary of the next sub-point (or the main vein past the last).
  const subN = p.sub_points, subH = draw(rng, p.sub_point_height), concave = draw(rng, p.scallop_depth)
  const fullness = draw(rng, p.lobe_fullness), perUnit = draw(rng, p.teeth_per_unit)
  const toothDepth = draw(rng, p.tooth_depth)
  const secAng = draw(rng, p.secondary_angle) * deg
  const primaries = lobes.map(l => ({ lobe: l, subs: [], teeth: [] }))   // sub-point tips; tooth tips
  const outline = [baseSinus]
  const edgeSeq = []  // [from, to, lobeIndex, fromIsSinus]
  for (let i = 0; i < lobes.length; i++) {
    const left = i === 0 ? baseSinus : sinus[i - 1], right = i === lobes.length - 1 ? baseSinus : sinus[i]
    edgeSeq.push([left, lobes[i].tip, i, true], [lobes[i].tip, right, i, false])
  }
  const branchFor = (lobe, axis, at) => {
    const tp = at[0] * axis[0] + at[1] * axis[1]
    const perp = Math.abs(at[0] * axis[1] - at[1] * axis[0])
    return Math.max(0.04 * lobe.len, Math.min(lobe.len * 0.9, tp - perp / Math.tan(secAng) - perp * 0.25))
  }
  for (const [from, to, li, fromSinus] of edgeSeq) {
    const lobe = lobes[li], axis = [Math.cos(lobe.a), Math.sin(lobe.a)]
    const S = fromSinus ? from : to, T = lobe.tip          // parametrise sinus(0) → tip(1)
    const chord = sub(T, S), L = len(chord)
    let n = [-chord[1] / L, chord[0] / L]                  // outward = away from the lobe's own axis
    const mid = lerp(S, T, 0.5)
    const side = Math.sign(axis[0] * mid[1] - axis[1] * mid[0]) || 1
    if (Math.sign(axis[0] * n[1] - axis[1] * n[0]) !== side) n = mul(n, -1)
    const t_ = chord.map(c => c / L)
    const edge = u => add(lerp(S, T, u), mul(n, fullness * L * 4 * u * (1 - u)))
    // the sub-points: count scales with the edge's length; each protrudes and leans toward the tip
    const k = Math.max(0, Math.round(draw(rng, subN) * L / lobe.len))
    const anchors = [{ at: S, u: 0 }]
    for (let j = 0; j < k; j++) {
      const u = 0.22 + 0.6 * (j + 0.5 + jit(0.25)) / k
      const h = subH * lobe.len * Math.sin(Math.PI * Math.min(0.95, u)) * (1 + jit(irr * 5))
      anchors.push({ at: add(add(edge(u), mul(n, h)), mul(t_, h * 0.45)), u, sub: true })
    }
    anchors.push({ at: T, u: 1 })
    // between consecutive anchors: a concave scallop, serrated if the species is
    const pts = []
    for (let a = 0; a < anchors.length - 1; a++) {
      const A = anchors[a].at, Bp = anchors[a + 1].at, seg = sub(Bp, A), sl = len(seg)
      let m = [-seg[1] / sl, seg[0] / sl]; if (m[0] * n[0] + m[1] * n[1] < 0) m = mul(m, -1)
      const scal = u => add(lerp(A, Bp, u), mul(m, -concave * sl * 4 * u * (1 - u)))
      const teeth = Math.round(perUnit * sl)
      const us = []
      for (let q = 0; q < teeth; q++) us.push((q + 0.5 + jit(0.3)) / (teeth + 0.4))
      us.sort((x, y) => x - y)
      // Each tooth: a NOTCH a little past the previous tip (long proximal flank), then the TIP, which
      // stands out from the edge and leans toward the lobe tip — straight flanks, a sharp point.
      // With no teeth the segment is the smooth scallop alone.
      const STEPS = 10
      if (!us.length) for (let st = 1; st < STEPS; st++) pts.push({ at: scal(st / STEPS) })
      let prevU = 0
      for (let q = 0; q < us.length; q++) {
        const u1 = us[q], gap = u1 - prevU
        const d = toothDepth * lobe.len * (1 + jit(irr * 6))
        pts.push({ at: add(scal(prevU + gap * 0.22), mul(m, -d * 0.65)), notch: true })
        pts.push({ at: add(add(scal(u1), mul(m, d * 0.35)), mul(seg, (d * 0.8) / sl)), tooth: true })
        prevU = u1
      }
      if (us.length) pts.push({ at: add(scal(prevU + (1 - prevU) * 0.3), mul(m, -toothDepth * lobe.len * 0.5)), notch: true })
      if (anchors[a + 1].sub) pts.push({ at: Bp, sub: true })
    }
    for (const q of pts) {
      if (q.sub) primaries[li].subs.push({ t: branchFor(lobe, axis, q.at), tip: q.at })
      else if (q.tooth) primaries[li].teeth.push(q.at)
    }
    const ordered = fromSinus ? pts : pts.slice().reverse()
    for (const q of ordered) outline.push(q.at)
    outline.push(fromSinus ? T : to)
  }

  // 5. veins with pipe-rule widths, junctions where they meet
  const w1 = draw(rng, p.vein_width)
  const W = n => w1 * Math.sqrt(n)
  const veins = [], junctions = [[0, 0]]
  let total = 0
  // Every vein MERGES TANGENTIALLY — it leaves its parent running alongside it and curves away
  // to its tip, as a stream joins a river (Jacob, 2026-09-28). A main vein leaves the base heading
  // along the stalk (tangency p.merge_tangency) before fanning to its lobe; a secondary leaves its
  // main vein along it; a minor-tooth vein leaves its secondary along it.
  const tang = draw(rng, p.merge_tangency)
  const bez = (a, c, b) => ({ at: t => lerp(lerp(a, c, t), lerp(c, b, t), t), d: t => { const v = add(mul(sub(c, a), 2 * (1 - t)), mul(sub(b, c), 2 * t)); const l = len(v) || 1; return [v[0] / l, v[1] / l] } })
  const curveFrom = (from, along, tip) => bez(from, lerp(add(from, mul(along, len(sub(tip, from)) * 0.3)), tip, 0.3), lerp(from, tip, 0.985))
  for (const pr of primaries) {
    const l = pr.lobe
    const dir = [Math.cos(l.a), Math.sin(l.a)]
    // an upward main vein leans with the stalk's line; a sideways or downward one leaves straight
    const tg = tang * Math.max(0, Math.sin(l.a))
    const lean = [dir[0] * (1 - tg), dir[1] * (1 - tg) + tg]
    const B = bez([0, 0], mul(lean, l.len * 0.42 / (len(lean) || 1)), l.tip)
    const N = 48, arc = [0]
    for (let k = 1; k <= N; k++) arc.push(arc[k - 1] + len(sub(B.at(k / N), B.at((k - 1) / N))))
    const sOf = t => { const target = (t / l.len) * arc[N]; let k = 1; while (k < N && arc[k] < target) k++; return (k - 1 + (target - arc[k - 1]) / Math.max(1e-9, arc[k] - arc[k - 1])) / N }
    // the sub-point secondaries
    const secs = pr.subs.map(sb => { const s0 = sOf(sb.t); const Q = curveFrom(B.at(s0), B.d(s0), sb.tip); return { s0, Q, teeth: [] } })
    // every tooth joins the NEAREST vein already there — a secondary or the main vein — tangentially
    const onPrimary = []
    for (const tip of pr.teeth) {
      let best = Infinity, pick = null
      for (let k = 2; k <= N - 1; k++) { const d = len(sub(B.at(k / N), tip)); if (d < best) { best = d; pick = { on: 'p', s: k / N } } }
      for (const sc of secs) for (let k = 3; k <= 13; k++) { const d = len(sub(sc.Q.at(k / 14), tip)); if (d < best) { best = d; pick = { on: sc, s: k / 14 } } }
      if (pick.on === 'p') onPrimary.push({ s: pick.s, tip }); else pick.on.teeth.push({ s: pick.s, tip })
    }
    const servedBeyond = sK => 1 + secs.filter(sc => sc.s0 > sK).reduce((a, sc) => a + 1 + sc.teeth.length, 0) + onPrimary.filter(o => o.s > sK).length
    total += servedBeyond(-1)
    const pts = [], ws = []
    for (let k = 0; k <= 24; k++) { pts.push(B.at(k / 24)); ws.push(W(servedBeyond(k / 24))) }
    veins.push({ pts, ws, order: 1 })
    const twig = (Qp, s0, tip, order, w) => {
      const from = Qp.at(s0); junctions.push(from)
      const C = curveFrom(from, Qp.d(s0), tip)
      veins.push({ pts: [0, 0.25, 0.5, 0.75, 1].map(C.at), ws: [1, 0.9, 0.8, 0.7, 0.6].map(k => w * k), order })
    }
    for (const sc of secs) {
      junctions.push(sc.Q.at(0))
      const sp = [], sw = []
      for (let k = 0; k <= 14; k++) { const t = k / 14; sp.push(sc.Q.at(t)); sw.push(W(1 + sc.teeth.filter(o => o.s > t).length) * 0.9) }
      veins.push({ pts: sp, ws: sw, order: 2 })
      for (const o of sc.teeth) twig(sc.Q, o.s, o.tip, 3, W(1) * 0.7)
    }
    for (const o of onPrimary) twig(B, o.s, o.tip, 3, W(1) * 0.75)
  }
  const petiole = { len: draw(rng, p.petiole_length), w: W(total) * draw(rng, p.petiole_width_factor), curve: jit(draw(rng, p.petiole_curvature)) }
  return { outline, veins, junctions, petiole }
}
const FAMILIES = { 'palmate-lobed': palmateLobed }

// ── lay one leaf into a cell: stalk end at STALK, blade filling the rest ───
// `age` (0 bud → 1 mature) shrinks the leaf toward its stalk. It is a knob, and the pack is drawn
// at age 1; growth animation evaluates the same seed at smaller ages.
function layout(leaf, age = 1) {
  let halfW = 0, minY = 0, maxY = 0
  for (const [x, y] of leaf.outline) { halfW = Math.max(halfW, Math.abs(x)); maxY = Math.max(maxY, y); minY = Math.min(minY, y) }
  const bladeBelow = Math.max(0, -minY)
  const s = Math.min((R * (STALK[1] - 0.03)) / (maxY + leaf.petiole.len), (R * 0.47) / halfW)
  const sa = s * (0.25 + 0.75 * age)
  const baseY = R * STALK[1] - s * Math.max(leaf.petiole.len, bladeBelow + 0.05)
  return { s, map: ([x, y]) => [R * STALK[0] + sa * x, baseY - sa * y] }
}
const pathOf = (pts, f) => 'M' + pts.map(p => f(p).map(v => v.toFixed(2)).join(' ')).join(' L') + ' Z'
function veinSvg(v, f, s) {
  const out = []
  for (let i = 0; i < v.pts.length - 1; i++) {
    const [x0, y0] = f(v.pts[i]), [x1, y1] = f(v.pts[i + 1])
    out.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${Math.max(0.6, s * v.ws[i]).toFixed(2)}"/>`)
  }
  return out.join('')
}
async function rasterGray(svgBody) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${R}" height="${R}"><rect width="100%" height="100%" fill="black"/>${svgBody}</svg>`
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true })
  const out = new Float32Array(R * R); for (let i = 0; i < out.length; i++) out[i] = data[i] / 255
  return out
}
async function blurGray(arr, sigma) {
  const buf = Buffer.alloc(R * R); for (let i = 0; i < buf.length; i++) buf[i] = Math.round(Math.min(1, arr[i]) * 255)
  // ⛔ sharp's blur hands back THREE channels for a one-channel input; read as one, every blurred
  // layer came out squashed and misregistered against the outline. Keep one channel explicitly.
  const { data } = await sharp(buf, { raw: { width: R, height: R, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
  const out = new Float32Array(R * R); for (let i = 0; i < out.length; i++) out[i] = data[i] / 255
  return out
}
// Chamfer distance (px) to the nearest set pixel — the areoles pucker and pale by it.
function distanceTo(mask) {
  const D = new Float32Array(R * R).fill(1e9)
  for (let i = 0; i < D.length; i++) if (mask[i] > 0.5) D[i] = 0
  const a = 1, b = Math.SQRT2
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x; let d = D[i]
    if (x > 0) d = Math.min(d, D[i - 1] + a)
    if (y > 0) { d = Math.min(d, D[i - R] + a); if (x > 0) d = Math.min(d, D[i - R - 1] + b); if (x < R - 1) d = Math.min(d, D[i - R + 1] + b) }
    D[i] = d
  }
  for (let y = R - 1; y >= 0; y--) for (let x = R - 1; x >= 0; x--) {
    const i = y * R + x; let d = D[i]
    if (x < R - 1) d = Math.min(d, D[i + 1] + a)
    if (y < R - 1) { d = Math.min(d, D[i + R] + a); if (x < R - 1) d = Math.min(d, D[i + R + 1] + b); if (x > 0) d = Math.min(d, D[i + R - 1] + b) }
    D[i] = d
  }
  return D
}
// The finest veins: the boundaries of cells around points scattered in the blade (areoles).
function areoleNet(blade, count, rng) {
  const seeds = []
  for (let tries = 0; seeds.length < count && tries < count * 40; tries++) {
    const x = rng() * R, y = rng() * R
    if (blade[(y | 0) * R + (x | 0)] > 0.5) seeds.push([x, y])
  }
  const B = Math.max(8, Math.round(R / 24)), grid = new Map()
  seeds.forEach((s, i) => { const k = `${(s[0] / B) | 0},${(s[1] / B) | 0}`; (grid.get(k) || grid.set(k, []).get(k)).push(i) })
  const owner = new Int32Array(R * R).fill(-1)
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x; if (blade[i] < 0.5) continue
    const gx = (x / B) | 0, gy = (y / B) | 0; let best = 1e18, bi = -1
    for (let r = 0; r <= 3 && bi < 0 || r <= 1; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const a = grid.get(`${gx + dx},${gy + dy}`); if (!a) continue
      for (const j of a) { const d = (seeds[j][0] - x) ** 2 + (seeds[j][1] - y) ** 2; if (d < best) { best = d; bi = j } }
    }
    owner[i] = bi
  }
  const net = new Float32Array(R * R)
  for (let y = 0; y < R - 1; y++) for (let x = 0; x < R - 1; x++) {
    const i = y * R + x; if (owner[i] < 0) continue
    if ((owner[i + 1] >= 0 && owner[i + 1] !== owner[i]) || (owner[i + R] >= 0 && owner[i + R] !== owner[i])) net[i] = 1
  }
  return net
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// ── one variant → RGBA/RGB cells at render resolution ──────────────────────
// Knobs: `fall` 0 (summer) → 1 (full fall) — the change STARTS at the vein junctions and runs
// along the veins before it takes the blade; `age` 0 (bud) → 1 (mature). The pack is drawn at
// age 1, fall 0 and 1; anything between is the same leaf, later or earlier.
async function drawVariant(model, season, seed, { age = 1, fall = 1 } = {}) {
  const rng = mulberry32(seed)
  const P = model.params
  const leaf = FAMILIES[model.family](P, rng)
  const L = layout(leaf, age)
  const f = L.map, sa = L.s * (0.25 + 0.75 * age)
  const blade = await rasterGray(`<path d="${pathOf(leaf.outline, f)}" fill="white"/>`)
  const [bx, by] = f([0, 0]), ex = R * STALK[0], ey = R * STALK[1]
  const mx = (bx + ex) / 2 + leaf.petiole.curve * sa, my = (by + ey) / 2
  const stalk = await rasterGray(`<path d="M${bx} ${by} Q${mx} ${my} ${ex} ${ey}" stroke="white" stroke-width="${Math.max(1.5, leaf.petiole.w * sa).toFixed(2)}" fill="none" stroke-linecap="round"/>`)
  const veinsHard = await rasterGray(`<g stroke="white" stroke-linecap="round">${leaf.veins.map(v => veinSvg(v, f, sa)).join('')}</g>`)
  const veins = await blurGray(veinsHard, 0.8)
  if (process.env.LEAF_DEBUG_DIR) {   // the skeleton alone, outline over veins, for the eye
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${R}" height="${R}"><rect width="100%" height="100%" fill="white"/><path d="${pathOf(leaf.outline, f)}" fill="#dfe9d8" stroke="#6a8" stroke-width="1"/><g stroke="#1a3" stroke-linecap="round">${leaf.veins.map(v => veinSvg(v, f, sa)).join('')}</g>${leaf.junctions.map(j => { const [x, y] = f(j); return `<circle cx="${x}" cy="${y}" r="3" fill="#d33"/>` }).join('')}</svg>`
    await sharp(Buffer.from(svg)).png().toFile(path.join(process.env.LEAF_DEBUG_DIR, `skeleton-${seed}.png`))
    const g = Buffer.alloc(R * R); for (let i = 0; i < g.length; i++) g[i] = Math.round(veinsHard[i] * 255)
    await sharp(g, { raw: { width: R, height: R, channels: 1 } }).png().toFile(path.join(process.env.LEAF_DEBUG_DIR, `veinsraster-${seed}.png`))
  }
  const net = areoleNet(blade, Math.round(draw(rng, P.areole_count)), rng)
  const netSoft = await blurGray(net, 0.7)
  const dVein = distanceTo(veinsHard)
  const dome = await blurGray(blade, R * 0.03)
  const junc = await blurGray(await rasterGray(leaf.junctions.map(j => { const [x, y] = f(j); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(R * 0.012).toFixed(1)}" fill="white"/>` }).join('')), R * P.junction_spread)
  const n1 = valueNoise2(seed ^ 0x9e3779b9), n2 = valueNoise2(seed ^ 0x85ebca6b)

  const summer0 = shift(hex(season.summer), jit1(rng, P.hue_jitter), 0, jit1(rng, P.light_jitter))
  const young = season.spring ? hex(season.spring) : summer0
  const fallPal = (P.fall_palette || [season.fall]).map(hex)
  const fallA = fallPal[Math.floor(rng() * fallPal.length)], fallB = fallPal[Math.floor(rng() * fallPal.length)]
  const fallMix = rng()
  const stalkCol = hex(P.petiole_color)
  const cellPx = R / 512
  // `fall`: the 'fall' page shows the leaf at this progress (the pack draws it at 1)
  const out = { summer: Buffer.alloc(R * R * 4), fall: Buffer.alloc(R * R * 4), normal: Buffer.alloc(R * R * 3) }
  const height = new Float32Array(R * R)
  const cols = { summer: new Float32Array(R * R * 3), fall: new Float32Array(R * R * 3) }
  const acc = { summer: [0, 0, 0], fall: [0, 0, 0] }; let accN = 0
  const baseCol = mix(young, summer0, age)
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x, u = x / R, v = y / R
    const inB = blade[i], vn = veins[i] * inB, an = netSoft[i] * inB * (1 - vn)
    const dv = dVein[i] / cellPx                         // distance to a vein, in 512-cell px
    const J = Math.min(1, junc[i] * 3)                   // the junction field
    const nearVein = Math.exp(-dv / 6)
    const mott = fbm(n1, u * 14, v * 14) - 0.5
    const inner = smooth(0.5, 1, dome[i])
    // SUMMER — the blade darkest between veins, paler and yellower toward them; the mottle gathers
    // at the junctions (where the season will begin).
    let s = shift(baseCol, mott * 5, 0, mott * P.mottle - (1 - nearVein) * 0.03)
    s = mix(s, shift(baseCol, 10, -0.02, 0.06), J * P.junction_mottle)
    s = mix(s, shift(baseCol, 18, -0.06, 0.15), Math.min(1, vn * 1.3))
    s = mix(s, shift(baseCol, 12, -0.03, 0.07), an * 0.5)
    s = mix(s, shift(baseCol, -6, 0, -0.05), (1 - inner) * 0.3)
    // FALL — progress runs junctions → veins → blade; the veins change with it
    const g = smooth(0, 1, fallMix + (fbm(n2, u * 5, v * 5) - 0.5) * 1.2)
    let fc = mix(fallA, fallB, g)
    const readiness = Math.min(1, 0.55 * J + 0.3 * nearVein + 0.3 * (fbm(n2, u * 9 + 3, v * 9) - 0.2))
    // a pixel turns once `fall` passes its threshold — junctions and veins have the lowest
    const fallAt = smooth(0.7 - readiness * 0.6, 1 - readiness * 0.6, fall + 0.3 * fall)
    fc = shift(fc, mott * 8, 0, mott * P.mottle)
    // the veins (and most of all their junctions) lose green first and go yellow-orange; the
    // middle of each space between veins is where the red runs deepest
    fc = mix(fc, shift(fc, -8, 0, -0.07), (1 - nearVein) * P.fall_areole_dark)
    fc = mix(fc, hex(P.fall_vein_color), Math.min(1, vn * 1.3) * (0.55 + 0.45 * J))
    fc = mix(fc, hex(P.fall_vein_color), J * P.fall_junction_glow)
    fc = mix(fc, shift(fc, 14, 0, 0.05), an * 0.4)
    fc = mix(s, fc, fallAt)
    if (stalk[i] > inB) { s = mix(stalkCol, s, 0); fc = shift(stalkCol, 0, 0, -0.05) }
    for (let c = 0; c < 3; c++) { cols.summer[i * 3 + c] = s[c]; cols.fall[i * 3 + c] = fc[c] }
    const a = Math.min(1, inB + stalk[i])
    if (a > 0.5) { for (let c = 0; c < 3; c++) { acc.summer[c] += s[c]; acc.fall[c] += fc[c] } accN++ }
    // HEIGHT — the blade domed; each areole puckers up between its veins; veins sunk into the face
    height[i] = inB * (dome[i] * P.dome + (1 - Math.exp(-dv / 5)) * P.areole_pucker - vn * P.vein_depth - an * P.vein_depth * 0.3
      + (fbm(n2, u * 4, v * 4) - 0.5) * P.wave) + stalk[i] * 0.6
  }
  const mean = k => acc[k].map(c => c / Math.max(1, accN))
  const k = P.normal_strength * R / 512
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x, a = Math.min(1, blade[i] + stalk[i])
    for (const key of ['summer', 'fall']) {
      const m = mean(key)
      for (let c = 0; c < 3; c++) out[key][i * 4 + c] = Math.round(Math.max(0, Math.min(255, a > 0.02 ? cols[key][i * 3 + c] : m[c])))
      out[key][i * 4 + 3] = Math.round(a * 255)
    }
    const hx = height[y * R + Math.min(R - 1, x + 1)] - height[y * R + Math.max(0, x - 1)]
    const hy = height[Math.min(R - 1, y + 1) * R + x] - height[Math.max(0, y - 1) * R + x]
    // OpenGL tangent space (+Y up); image rows grow down, so +Y = -rows ⇒ ny = +hy
    let nx = -hx * k, ny = hy * k, nz = 1; const ln = Math.hypot(nx, ny, nz); nx /= ln; ny /= ln; nz /= ln
    out.normal[i * 3] = Math.round((nx * 0.5 + 0.5) * 255); out.normal[i * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255); out.normal[i * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255)
  }
  const down = (buf, ch) => sharp(buf, { raw: { width: R, height: R, channels: ch } }).resize(CELL, CELL, { kernel: 'lanczos3' }).raw().toBuffer()
  // How many blade-lengths one cell edge spans — × the species' leaf length, the cell's real size.
  return { summer: await down(out.summer, 4), fall: await down(out.fall, 4), normal: await down(out.normal, 3), cellBlades: R / L.s }
}
const jit1 = (rng, amt) => (rng() - 0.5) * 2 * amt


// ── the pack ───────────────────────────────────────────────────────────────
export async function generateLeafPack({ species, pack, cell = 512, outDir = null }) {
  CELL = cell; R = CELL * SS
  const dossier = JSON.parse(await fs.readFile(path.join(DOSSIERS, `${species}.json`), 'utf8'))
  const model = dossier.leafModel
  if (!model) throw new Error(`⛔ ${species}: dossier has no leafModel — nothing to draw from. Author one first.`)
  if (!FAMILIES[model.family]) throw new Error(`⛔ ${species}: leafModel.family "${model.family}" is not drawn by this generator (have: ${Object.keys(FAMILIES).join(', ')})`)
  const season = dossier.required?.['leaf.season']?.anchors
  if (!season?.summer) throw new Error(`⛔ ${species}: dossier leaf.season has no summer anchor — the leaf has no colour to be.`)
  if (!season.fall && !model.params.fall_palette) throw new Error(`⛔ ${species}: no fall anchor and no fall_palette.`)
  const [cols, rows] = model.grid
  const modelHash = crypto.createHash('sha1').update(JSON.stringify({ model, season })).digest('hex').slice(0, 12)
  const seed0 = parseInt(modelHash.slice(0, 8), 16)
  const sheets = { summer: [], fall: [], normal: [] }
  const leafLenM = dossier.required?.['leaf.length']?.target
  if (!(leafLenM > 0)) throw new Error(`⛔ ${species}: dossier leaf.length has no target — the leaf has no real size.`)
  const cellMetres = []
  for (let i = 0; i < cols * rows; i++) {
    const cell = await drawVariant(model, season, (seed0 + i * 7919) >>> 0)
    cellMetres.push(+(cell.cellBlades * leafLenM / 100).toFixed(4))
    for (const k of Object.keys(sheets)) sheets[k].push({ input: cell[k], raw: { width: CELL, height: CELL, channels: k === 'normal' ? 3 : 4 }, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })
  }
  const out = outDir || path.join(SHAPES, pack)
  await fs.mkdir(out, { recursive: true })
  const W = cols * CELL, H = rows * CELL
  const blank = (ch, bg) => sharp({ create: { width: W, height: H, channels: ch, background: bg } })
  await blank(4, { r: 0, g: 0, b: 0, alpha: 0 }).composite(sheets.summer).png().toFile(path.join(out, 'shape.png'))
  await blank(4, { r: 0, g: 0, b: 0, alpha: 0 }).composite(sheets.fall).png().toFile(path.join(out, 'fall.png'))
  await blank(3, { r: 128, g: 128, b: 255 }).composite(sheets.normal).removeAlpha().png().toFile(path.join(out, 'normal.png'))
  // The plate's picture: ONE leaf (the first variant, summer) — the picker shows a leaf, not the sheet.
  await sharp(sheets.summer[0].input, { raw: sheets.summer[0].raw }).png().toFile(path.join(out, 'thumb.png'))
  const meta = {
    morphology: model.morphology,
    naturalSize: dossier.required?.['leaf.length']?.target ?? null,
    tileGrid: [cols, rows],
    quality: 'procedural',
    recommendedSpecies: [species],
    leafAxes: model.leafAxes || {},
    stalk: STALK,
    // Real metres one cell edge spans, per cell (row-major): the leaf is placed at its true size.
    cellMetres,
    channels: { albedo: 'shape.png', normal: 'normal.png', fall: 'fall.png', thumb: 'thumb.png' },
    source: { generator: 'arborist/leaf-generator.mjs', family: model.family, dossier: `arborist/dossiers/${species}.json`, modelHash },
    _doc: 'Generated — do not hand-edit. Re-run: node arborist/leaf-generator.mjs --species ' + species + ' --pack ' + pack + '. fall.png is drawn but not yet rendered (no season renderer).',
  }
  await fs.writeFile(path.join(out, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  return { out, meta }
}

const isCli = import.meta.url === `file://${process.argv[1]}`
if (isCli) {
  const arg = k => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null }
  const species = arg('species'), pack = arg('pack')
  if (!species || !pack) { console.error('usage: node arborist/leaf-generator.mjs --species <dossier id> --pack <pack id> [--cell <px> --out <dir>]'); process.exit(2) }
  // --cell/--out: a close-up render for the eye (same leaves, same seeds, more pixels), written
  // anywhere but the pack — the pack's cell size is what the atlas is built for.
  const cell = arg('cell') ? Number(arg('cell')) : 512, outDir = arg('out') ? path.resolve(arg('out')) : null
  if (cell !== 512 && !outDir) { console.error('⛔ --cell other than 512 needs --out: a close-up must not overwrite the pack'); process.exit(2) }
  const { out, meta } = await generateLeafPack({ species, pack, cell, outDir })
  console.log(`✅ ${pack}: ${meta.tileGrid[0] * meta.tileGrid[1]} leaves → ${path.relative(REPO, out)} (model ${meta.source.modelHash})`)
}
