// marram-relief-scale.mjs — WHERE DOES 1 m OF RELIEF END AND SURFACE DETAIL BEGIN?
// ▶ node scratch/marram-relief-scale.mjs [--scene=provincetown] [--win=400] [--n=3]
//
// Reads the 1 m lidar tiles named in raw/elevation-sources.txt by HTTP range request
// (a window only), over the N highest-relief sand polygons, and asks how much of the
// 1 m surface the kit's baked grid can carry. Grid step is READ from clean/terrain.json.
// Per window: the residual (1 m DEM − the grid-step reconstruction of it) as RMS / p99 /
// max, and the slope the 1 m surface has that the grid-step surface does not.
// ⛔ Writes nothing.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromUrl } from 'geotiff'

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]
const scene = arg('scene', 'provincetown'), WIN = +arg('win', 400), N = +arg('n', 3)
const D = join('cartograph/data', scene)
const geo = JSON.parse(readFileSync(join(D, 'geography.json'), 'utf8'))
const osm = JSON.parse(readFileSync(join(D, 'raw/osm.json'), 'utf8'))
const tj = JSON.parse(readFileSync(join(D, 'clean/terrain.json'), 'utf8'))
const tb = readFileSync(join(D, 'clean/terrain.bin'))
const T = new Float32Array(tb.buffer, tb.byteOffset, tj.width * tj.height)
const STEP = (tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1)
const urls = readFileSync(join(D, 'raw/elevation-sources.txt'), 'utf8').split('\n').filter(l => l.startsWith('http'))

// UTM forward — same formula as bake-terrain.js utmForward (not exported there).
const A_ = 6378137.0, F_ = 1 / 298.257223563, K0 = 0.9996
function utm(lon, lat, zone) {
  const e2 = F_ * (2 - F_), ep2 = e2 / (1 - e2), lon0 = (6 * zone - 183) * Math.PI / 180
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180
  const Nn = A_ / Math.sqrt(1 - e2 * Math.sin(p) ** 2), Tt = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = (l - lon0) * Math.cos(p)
  const M = A_ * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p))
  return [500000 + K0 * Nn * (A + (1 - Tt + C) * A ** 3 / 6 + (5 - 18 * Tt + Tt ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120),
    K0 * (M + Nn * Math.tan(p) * (A ** 2 / 2 + (5 - Tt + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * Tt + Tt ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720))]
}

// ── pick the N highest-relief sand polygons off the BAKED grid ───────────────
const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const cand = []
for (const f of osm.ground.natural) {
  if (!['sand', 'dune', 'beach'].includes(f.tags?.natural) || !f.isClosed) continue
  let lo = Infinity, hi = -Infinity, cx = 0, cy = 0
  for (const c of f.coords) { cx += c.lon; cy += c.lat }
  cx /= f.coords.length; cy /= f.coords.length
  const [x, z] = toLocal(cx, cy)
  const i0 = Math.round((x - tj.bounds.minX) / STEP), j0 = Math.round((z - tj.bounds.minZ) / STEP), r = Math.round(WIN / 2 / STEP)
  for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
    if (i < 0 || j < 0 || i >= tj.width || j >= tj.height) continue
    const v = T[j * tj.width + i]; lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  cand.push({ id: f.osmId, tag: f.tags.natural, desc: f.tags['massgis:IT_VALDESC'] || '', lon: cx, lat: cy, relief: hi - lo })
}
cand.sort((a, b) => b.relief - a.relief)
const picks = []
for (const c of cand) { if (picks.every(p => Math.hypot((p.lon - c.lon) * geo.lonToMeters, (p.lat - c.lat) * geo.latToMeters) > WIN)) picks.push(c); if (picks.length >= N) break }

const tiffs = []
for (const u of urls) { const t = await fromUrl(u); const im = await t.getImage(0); tiffs.push({ u, im, bb: im.getBoundingBox(), res: im.getResolution() }) }
const zone = (() => { const k = tiffs[0].im.getGeoKeys().ProjectedCSTypeGeoKey; return k > 32600 ? k - 32600 : k - 26900 })()

console.log(`${scene}: baked grid step ${STEP.toFixed(2)} m · lidar ${Math.abs(tiffs[0].res[0])} m · UTM ${zone}N · window ${WIN} m`)
for (const p of picks) {
  const [E, Nn] = utm(p.lon, p.lat, zone)
  const t = tiffs.find(t => E - WIN / 2 >= t.bb[0] && E + WIN / 2 <= t.bb[2] && Nn - WIN / 2 >= t.bb[1] && Nn + WIN / 2 <= t.bb[3])
  if (!t) { console.log(`  ${p.id}: window straddles tiles — skipped`); continue }
  const rx = t.res[0], ry = Math.abs(t.res[1])
  const px0 = Math.round((E - WIN / 2 - t.bb[0]) / rx), py0 = Math.round((t.bb[3] - (Nn + WIN / 2)) / ry)
  const w = Math.round(WIN / rx), h = Math.round(WIN / ry)
  const [band] = await t.im.readRasters({ window: [px0, py0, px0 + w, py0 + h] })
  // reconstruct at the grid step: box-average to STEP, bilinear back up — what a STEP grid carries.
  const s = Math.round(STEP / rx), cw = Math.floor(w / s), ch = Math.floor(h / s)
  const C = new Float32Array(cw * ch)
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    let acc = 0; for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) acc += band[(j * s + b) * w + i * s + a]
    C[j * cw + i] = acc / (s * s)
  }
  const recon = (x, y) => { // x,y in 1 m px
    const u = Math.min(cw - 1.001, Math.max(0, (x + 0.5) / s - 0.5)), v = Math.min(ch - 1.001, Math.max(0, (y + 0.5) / s - 0.5))
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
    return (C[j * cw + i] * (1 - fu) + C[j * cw + i + 1] * fu) * (1 - fv) + (C[(j + 1) * cw + i] * (1 - fu) + C[(j + 1) * cw + i + 1] * fu) * fv
  }
  const res = [], slopeFine = [], slopeGrid = []
  let lo = Infinity, hi = -Infinity
  for (let y = 1; y < ch * s - 1; y++) for (let x = 1; x < cw * s - 1; x++) {
    const v = band[y * w + x]; if (!(v > -1000)) continue
    lo = Math.min(lo, v); hi = Math.max(hi, v)
    res.push(Math.abs(v - recon(x, y)))
    const gx = (band[y * w + x + 1] - band[y * w + x - 1]) / 2, gy = (band[(y + 1) * w + x] - band[(y - 1) * w + x]) / 2
    slopeFine.push(Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI)
    const hx = (recon(x + 1, y) - recon(x - 1, y)) / 2, hy = (recon(x, y + 1) - recon(x, y - 1)) / 2
    slopeGrid.push(Math.atan(Math.hypot(hx, hy)) * 180 / Math.PI)
  }
  const q = (a, f) => { const b = Float32Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(f * b.length))] }
  const rms = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length)
  console.log(`\n  osm ${p.id} natural:${p.tag} ${p.desc ? '[' + p.desc + ']' : ''}  relief in window ${(hi - lo).toFixed(1)} m (1 m) · ${p.relief.toFixed(1)} m (baked)`)
  console.log(`    ⭐ residual 1 m − ${STEP} m reconstruction:  RMS ${rms.toFixed(2)} m · p90 ${q(res, .9).toFixed(2)} · p99 ${q(res, .99).toFixed(2)} · max ${q(res, 1).toFixed(2)} m`)
  console.log(`    slope p50/p90/p99  at 1 m: ${q(slopeFine, .5).toFixed(1)}/${q(slopeFine, .9).toFixed(1)}/${q(slopeFine, .99).toFixed(1)}°   at ${STEP} m: ${q(slopeGrid, .5).toFixed(1)}/${q(slopeGrid, .9).toFixed(1)}/${q(slopeGrid, .99).toFixed(1)}°`)
}
