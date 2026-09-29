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
// Families drawn today: 'palmate-lobed'.
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

const CELL = 512          // shipped cell edge, px
const SS = 2              // supersample factor for the draw
const R = CELL * SS       // draw resolution per cell
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

// ── the palmate-lobed family ──────────────────────────────────────────────
// Leaf space: blade base (stalk junction) at the origin, +y along the midrib, blade length 1.
// The outline is a radius per angle — the union of the lobes (each a tapered wedge toward its
// tip), a floor that sets the sinus depth, the margin's teeth, and a slow wobble.
function palmateLobed(p, rng) {
  const lobes = []
  const push = (ang, len, half) => lobes.push({ ang: ang * Math.PI / 180, len, half: half * Math.PI / 180 })
  const asym = 1 + (rng() - 0.5) * 2 * draw(rng, p.asymmetry)
  const sideAng = draw(rng, p.side_lobe_angle), sideLen = draw(rng, p.side_lobe_length), half = draw(rng, p.lobe_half_width)
  push(90, 1, half)
  push(90 - sideAng, sideLen * asym, half * 0.95)
  push(90 + sideAng, sideLen / asym, half * 0.95)
  if (rng() < p.basal_lobe_chance) {
    const bAng = draw(rng, p.basal_lobe_angle), bLen = draw(rng, p.basal_lobe_length)
    push(90 - bAng, bLen * asym, half * 0.7)
    push(90 + bAng, bLen / asym, half * 0.7)
  }
  const floor = draw(rng, p.sinus_depth)          // radius at the bottom of a sinus, × blade length
  const tipSharp = draw(rng, p.tip_sharpness)
  const teeth = draw(rng, p.tooth_count), toothAmp = draw(rng, p.tooth_size), tooth2 = draw(rng, p.tooth_double)
  const wob = valueNoise2((rng() * 1e9) | 0), wobAmp = draw(rng, p.irregularity)
  const baseHalf = draw(rng, p.base_opening) * Math.PI / 180
  const baseSpan = draw(rng, p.base_span) * Math.PI / 180
  const radius = (th) => {
    let r = 0
    for (const L of lobes) {
      let d = Math.abs(th - L.ang); if (d > Math.PI) d = 2 * Math.PI - d
      const x = d / L.half
      if (x < 1) r = Math.max(r, L.len * Math.pow(1 - x, tipSharp))
    }
    // the base: the sinus floor fades out toward straight down, so the blade meets the stalk
    // across a truncate-to-shallow base instead of wrapping under it
    let dDown = Math.abs(th + Math.PI / 2); if (dDown > Math.PI) dDown = 2 * Math.PI - dDown
    const bt = Math.min(1, Math.max(0, (dDown - baseHalf) / baseSpan))
    r = Math.max(r, floor * bt * bt * (3 - 2 * bt))
    // teeth: an asymmetric saw, forward-leaning; a finer second set for a doubly-toothed margin
    const saw = (t) => { const f = t - Math.floor(t); return f < 0.7 ? f / 0.7 : (1 - f) / 0.3 }
    r *= 1 + toothAmp * (saw(th * teeth / (2 * Math.PI)) - 0.5) + toothAmp * tooth2 * 0.5 * (saw(th * teeth * 2.6 / (2 * Math.PI)) - 0.5)
    r *= 1 + wobAmp * (wob(th * 3, 7.3) - 0.5)
    return r
  }
  // outline: sweep from just right of straight-down, all the way round, to just left of it
  const start = -Math.PI / 2 + baseHalf, end = 3 * Math.PI / 2 - baseHalf, N = 1400
  const pts = [[0, 0]]
  for (let i = 0; i <= N; i++) { const th = start + (end - start) * i / N; const r = radius(th); pts.push([r * Math.cos(th), r * Math.sin(th)]) }
  // veins: a primary to each lobe tip, secondaries off each primary toward the margin
  const veins = []
  const vw = draw(rng, p.vein_width)
  for (const L of lobes) {
    const tipR = radius(L.ang) * 0.93
    const bend = (rng() - 0.5) * 0.08
    veins.push({ pts: [[0, 0], [Math.cos(L.ang + bend) * tipR * 0.5, Math.sin(L.ang + bend) * tipR * 0.5], [Math.cos(L.ang) * tipR, Math.sin(L.ang) * tipR]], w0: vw * (L.len > 0.9 ? 1 : 0.8), w1: vw * 0.25 })
    const nSec = Math.max(2, Math.round(draw(rng, p.secondary_count) * L.len))
    const secAng = draw(rng, p.secondary_angle) * Math.PI / 180
    for (let k = 1; k <= nSec; k++) {
      const t = k / (nSec + 1)
      const ox = Math.cos(L.ang) * tipR * t, oy = Math.sin(L.ang) * tipR * t
      for (const side of [-1, 1]) {
        const a = L.ang + side * secAng
        const len = Math.max(0.05, radius(a) * 0.85 - tipR * t * Math.cos(secAng)) * 0.75
        veins.push({ pts: [[ox, oy], [ox + Math.cos(a) * len * 0.55, oy + Math.sin(a) * len * 0.55], [ox + Math.cos(a) * len, oy + Math.sin(a) * len]], w0: vw * 0.45, w1: vw * 0.1 })
      }
    }
  }
  const petiole = { len: draw(rng, p.petiole_length), w: draw(rng, p.petiole_width), curve: (rng() - 0.5) * draw(rng, p.petiole_curvature) }
  return { outline: pts, veins, petiole }
}
const FAMILIES = { 'palmate-lobed': palmateLobed }

// ── lay one leaf into a cell: stalk end at STALK, blade filling the rest ───
function layout(leaf) {
  let halfW = 0, maxY = 0
  for (const [x, y] of leaf.outline) { halfW = Math.max(halfW, Math.abs(x)); maxY = Math.max(maxY, y) }
  const s = Math.min((R * (STALK[1] - 0.03)) / (maxY + leaf.petiole.len), (R * 0.47) / halfW)
  const baseY = R * STALK[1] - s * leaf.petiole.len
  return { s, map: ([x, y]) => [R * STALK[0] + s * x, baseY - s * y] }
}
const pathOf = (pts, f) => 'M' + pts.map(p => f(p).map(v => v.toFixed(2)).join(' ')).join(' L') + ' Z'
function strokeSvg(v, f, s) {
  // a tapered vein as a chain of segments with falling width
  const out = [], [a, b, c] = v.pts, n = 12
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n
    const q = t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]
    const [x0, y0] = f(q(t0)), [x1, y1] = f(q(t1))
    out.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${(s * (v.w0 + (v.w1 - v.w0) * t0)).toFixed(2)}"/>`)
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
  const buf = Buffer.alloc(R * R); for (let i = 0; i < buf.length; i++) buf[i] = Math.round(arr[i] * 255)
  const { data } = await sharp(buf, { raw: { width: R, height: R, channels: 1 } }).blur(sigma).raw().toBuffer({ resolveWithObject: true })
  const out = new Float32Array(R * R); for (let i = 0; i < out.length; i++) out[i] = data[i] / 255
  return out
}

// ── one variant → three RGBA/RGB cells at render resolution ────────────────
async function drawVariant(model, season, seed) {
  const rng = mulberry32(seed)
  const leaf = FAMILIES[model.family](model.params, rng)
  const L = layout(leaf)
  const f = L.map
  const bladeD = pathOf(leaf.outline, f)
  // stalk: from the blade base down to STALK, a gentle curve
  const [bx, by] = f([0, 0]), ex = R * STALK[0], ey = R * STALK[1]
  const mx = (bx + ex) / 2 + leaf.petiole.curve * L.s, my = (by + ey) / 2
  const petW = leaf.petiole.w * L.s
  const petioleSvg = `<path d="M${bx} ${by} Q${mx} ${my} ${ex} ${ey}" stroke="white" stroke-width="${petW.toFixed(2)}" fill="none" stroke-linecap="round"/>`
  const blade = await rasterGray(`<path d="${bladeD}" fill="white"/>`)
  const stalk = await rasterGray(petioleSvg)
  const veinsA = await rasterGray(`<g stroke="white" stroke-linecap="round">${leaf.veins.map(v => strokeSvg(v, f, L.s)).join('')}</g>`)
  const dome = await blurGray(blade, R * 0.035)
  const veinSoft = await blurGray(veinsA, 1.2)
  const n1 = valueNoise2(seed ^ 0x9e3779b9), n2 = valueNoise2(seed ^ 0x85ebca6b)

  // per-leaf colour: each leaf its own draw around the season anchor
  const summer0 = shift(hex(season.summer), (rng() - 0.5) * 2 * model.params.hue_jitter, 0, (rng() - 0.5) * 2 * model.params.light_jitter)
  const fallPal = (model.params.fall_palette || [season.fall]).map(hex)
  const fallA = fallPal[Math.floor(rng() * fallPal.length)], fallB = fallPal[Math.floor(rng() * fallPal.length)]
  const fallMix = rng()
  const stalkCol = hex(model.params.petiole_color)

  const alpha = new Float32Array(R * R), height = new Float32Array(R * R)
  const sum = new Float32Array(R * R * 3), fal = new Float32Array(R * R * 3)
  let accS = [0, 0, 0], accF = [0, 0, 0], accN = 0
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x
    const a = Math.min(1, blade[i] + stalk[i]); alpha[i] = a
    const u = x / R, v = y / R
    const mott = fbm(n1, u * 18, v * 18) - 0.5
    const inner = Math.min(1, Math.max(0, (dome[i] - 0.5) * 2))   // 0 at the margin → 1 well inside
    const vn = veinSoft[i] * blade[i]
    // SUMMER: anchor ± mottle; veins paler and yellower; margin a touch darker
    let s = shift(summer0, mott * 6, 0, mott * model.params.mottle)
    s = mix(s, shift(summer0, 18, -0.05, 0.16), Math.min(1, vn * 1.4))
    s = mix(s, shift(summer0, -6, 0, -0.05), (1 - inner) * 0.35)
    // FALL: two palette colours blended across the leaf; margin reddens, veins hold yellow
    const g = Math.min(1, Math.max(0, fallMix + (fbm(n2, u * 5, v * 5) - 0.5) * 1.2))
    let fc = mix(fallA, fallB, g)
    fc = shift(fc, mott * 8, 0, mott * model.params.mottle)
    fc = mix(fc, shift(fc, 25, 0, 0.1), Math.min(1, vn * 1.1))
    fc = mix(fc, shift(fc, -10, 0.05, -0.08), (1 - inner) * 0.5)
    if (stalk[i] > blade[i]) { s = stalkCol; fc = shift(stalkCol, 0, 0, -0.05) }
    for (let c = 0; c < 3; c++) { sum[i * 3 + c] = s[c]; fal[i * 3 + c] = fc[c] }
    if (a > 0.5) { for (let c = 0; c < 3; c++) { accS[c] += s[c]; accF[c] += fc[c] } accN++ }
    // height: domed blade, sunken veins (upper face), slow wave
    height[i] = blade[i] * (dome[i] * model.params.dome - vn * model.params.vein_depth + (fbm(n2, u * 4, v * 4) - 0.5) * model.params.wave) + stalk[i] * 0.6
  }
  // Transparent texels carry the leaf's mean colour, so mips and filtering never pull in black.
  const meanS = accS.map(c => c / Math.max(1, accN)), meanF = accF.map(c => c / Math.max(1, accN))
  const cellS = Buffer.alloc(R * R * 4), cellF = Buffer.alloc(R * R * 4), cellN = Buffer.alloc(R * R * 3)
  const k = model.params.normal_strength * R / 512
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = y * R + x, a = alpha[i]
    for (let c = 0; c < 3; c++) {
      cellS[i * 4 + c] = Math.round(a > 0.02 ? sum[i * 3 + c] : meanS[c])
      cellF[i * 4 + c] = Math.round(a > 0.02 ? fal[i * 3 + c] : meanF[c])
    }
    cellS[i * 4 + 3] = cellF[i * 4 + 3] = Math.round(a * 255)
    const hx = height[y * R + Math.min(R - 1, x + 1)] - height[y * R + Math.max(0, x - 1)]
    const hy = height[Math.min(R - 1, y + 1) * R + x] - height[Math.max(0, y - 1) * R + x]
    // OpenGL tangent space (+Y up); image rows grow down, so +Y = -rows ⇒ ny = +hy
    let nx = -hx * k, ny = hy * k, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len
    cellN[i * 3] = Math.round((nx * 0.5 + 0.5) * 255); cellN[i * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255); cellN[i * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255)
  }
  const down = (buf, ch) => sharp(buf, { raw: { width: R, height: R, channels: ch } }).resize(CELL, CELL, { kernel: 'lanczos3' }).raw().toBuffer()
  return { summer: await down(cellS, 4), fall: await down(cellF, 4), normal: await down(cellN, 3) }
}

// ── the pack ───────────────────────────────────────────────────────────────
export async function generateLeafPack({ species, pack }) {
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
  for (let i = 0; i < cols * rows; i++) {
    const cell = await drawVariant(model, season, (seed0 + i * 7919) >>> 0)
    for (const k of Object.keys(sheets)) sheets[k].push({ input: cell[k], raw: { width: CELL, height: CELL, channels: k === 'normal' ? 3 : 4 }, left: (i % cols) * CELL, top: Math.floor(i / cols) * CELL })
  }
  const out = path.join(SHAPES, pack)
  await fs.mkdir(out, { recursive: true })
  const W = cols * CELL, H = rows * CELL
  const blank = (ch, bg) => sharp({ create: { width: W, height: H, channels: ch, background: bg } })
  await blank(4, { r: 0, g: 0, b: 0, alpha: 0 }).composite(sheets.summer).png().toFile(path.join(out, 'shape.png'))
  await blank(4, { r: 0, g: 0, b: 0, alpha: 0 }).composite(sheets.fall).png().toFile(path.join(out, 'fall.png'))
  await blank(3, { r: 128, g: 128, b: 255 }).composite(sheets.normal).removeAlpha().png().toFile(path.join(out, 'normal.png'))
  const meta = {
    morphology: model.morphology,
    naturalSize: dossier.required?.['leaf.length']?.target ?? null,
    tileGrid: [cols, rows],
    quality: 'procedural',
    recommendedSpecies: [species],
    leafAxes: model.leafAxes || {},
    stalk: STALK,
    channels: { albedo: 'shape.png', normal: 'normal.png', fall: 'fall.png' },
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
  if (!species || !pack) { console.error('usage: node arborist/leaf-generator.mjs --species <dossier id> --pack <pack id>'); process.exit(2) }
  const { out, meta } = await generateLeafPack({ species, pack })
  console.log(`✅ ${pack}: ${meta.tileGrid[0] * meta.tileGrid[1]} leaves → ${path.relative(REPO, out)} (model ${meta.source.modelHash})`)
}
