// marram-sand-relief.mjs — what the relief says about every sand/beach/dune polygon.
// ▶ node scratch/marram-sand-relief.mjs [--scene=provincetown]
// Reads raw/osm.json + clean/terrain.{json,bin}. Writes nothing.
// Per tag (and per MassGIS IT_VALDESC where present): count, area, and the terrain
// inside — relief (p95−p5 elevation) and slope percentiles off the baked grid.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const scene = (process.argv.find(a => a.startsWith('--scene=')) || '--scene=provincetown').split('=')[1]
const D = join('cartograph/data', scene)
const geo = JSON.parse(readFileSync(join(D, 'geography.json'), 'utf8'))
const osm = JSON.parse(readFileSync(join(D, 'raw/osm.json'), 'utf8'))
const tj = JSON.parse(readFileSync(join(D, 'clean/terrain.json'), 'utf8'))
const tb = readFileSync(join(D, 'clean/terrain.bin'))
const T = new Float32Array(tb.buffer, tb.byteOffset, tj.width * tj.height)
const { width: W, height: H, bounds: B } = tj
const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1)
console.log(`${scene}: terrain ${W}×${H}, step ${sx.toFixed(2)}×${sz.toFixed(2)} m, datum ${tj.datum}`)

const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]
const at = (i, j) => T[j * W + i]
function slopeDeg(i, j) {
  if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) return NaN
  const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * sx), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * sz)
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI
}
function pip(x, z, ring) {
  let c = false
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const [xa, za] = ring[a], [xb, zb] = ring[b]
    if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) c = !c
  }
  return c
}
const area = r => Math.abs(r.reduce((s, p, k) => { const q = r[(k + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN

const feats = osm.ground.natural.filter(f => ['sand', 'beach', 'dune'].includes(f.tags?.natural) && f.isClosed && f.coords?.length > 3)
const groups = new Map()
for (const f of feats) {
  const ring = f.coords.map(c => toLocal(c.lon, c.lat))
  const key = `natural:${f.tags.natural}` + (f.tags['massgis:IT_VALDESC'] ? ` [${f.tags['massgis:IT_VALDESC']}]` : '')
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const el = [], sl = []
  // scanline fill: crossings per grid row, then every sample between pairs.
  for (let j = Math.max(1, Math.floor((z0 - B.minZ) / sz)); j <= Math.min(H - 2, Math.ceil((z1 - B.minZ) / sz)); j++) {
    const z = B.minZ + j * sz, xs = []
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, za] = ring[a], [xb, zb] = ring[b]
      if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(1, Math.ceil((xs[k] - B.minX) / sx)); i <= Math.min(W - 2, Math.floor((xs[k + 1] - B.minX) / sx)); i++) {
        el.push(at(i, j)); sl.push(slopeDeg(i, j))
      }
  }
  const g = groups.get(key) || { n: 0, area: 0, el: [], sl: [], per: [] }
  g.n++; g.area += area(ring); for (const v of el) g.el.push(v); for (const v of sl) if (Number.isFinite(v)) g.sl.push(v)
  el.sort((a, b) => a - b)
  g.per.push({ id: f.osmId, a: area(ring), relief: el.length ? pct(el, .95) - pct(el, .05) : NaN, n: el.length })
  groups.set(key, g)
}
console.log('\n tag [massgis desc]                         n    area ha   samples  relief p95-p5 m   slope p50/p90/p99 °   %>10°  %>20°')
for (const [k, g] of [...groups].sort((a, b) => b[1].area - a[1].area)) {
  g.el.sort((a, b) => a - b); g.sl.sort((a, b) => a - b)
  const hi10 = g.sl.filter(s => s > 10).length / Math.max(1, g.sl.length), hi20 = g.sl.filter(s => s > 20).length / Math.max(1, g.sl.length)
  console.log(` ${k.padEnd(42)} ${String(g.n).padStart(3)} ${(g.area / 1e4).toFixed(1).padStart(9)} ${String(g.el.length).padStart(9)} ${(pct(g.el, .95) - pct(g.el, .05)).toFixed(1).padStart(12)}      ${pct(g.sl, .5).toFixed(1)}/${pct(g.sl, .9).toFixed(1)}/${pct(g.sl, .99).toFixed(1)}`.padEnd(120) + ` ${(hi10 * 100).toFixed(0).padStart(4)}  ${(hi20 * 100).toFixed(0).padStart(4)}`)
}
const unsampled = [...groups.values()].flatMap(g => g.per).filter(p => !p.n)
console.log(`\n polygons with ZERO terrain samples inside (smaller than a grid cell, or off the grid): ${unsampled.length}`)
