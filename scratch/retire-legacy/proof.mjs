// proof.mjs — cartograph/_archive/BRIEF-retire-the-legacy-shape-pass-LANDED-2026-10-20.md §3: the deletion changes nothing on screen (Lintel, 2026-10-19).
// Runs the BAKE'S OWN path (`bakeGround({ stackOnly: true })`, nothing written) for one town, with bake-ground.js swapped for a
// copy that only records `pr` (buildTileGround's return) and the wall-clock / peak RSS around that one call (BG, run.sh). Prints
// a hash per returned field, a hash of the stack the flatten receives, and of `ribbons` after the build (a legacy mutation leak
// would show there), plus STOP 2: every non-highway grade-separated centreline sampled against the final asphalt ∪ highway.
// Read-only. One town per process: node … proof.mjs --scene=<town>  (PROOF_OUT=<file.json> writes the record)
import fs from 'fs'
import crypto from 'crypto'
import { lookFor } from '../_proto-feed.mjs'
import { bakeGround } from '../../cartograph/bake-ground.js'

const scene = (process.argv.find(a => a.startsWith('--scene=')) || '').slice(8)
if (!scene) { console.error('usage: proof.mjs --scene=<town>'); process.exit(2) }
const look = lookFor(scene)
if (!look) { console.error(`⛔ ${scene}: no Look in public/looks/index.json`); process.exit(2) }

// canonical hash: object keys sorted, Set/Map as arrays, functions skipped, numbers exact (Object.is distinguishes -0)
const hashOf = (v) => {
  const h = crypto.createHash('sha1'), seen = new WeakSet()
  const walk = (x) => {
    if (x === undefined) { h.update('u'); return }
    if (x === null) { h.update('n'); return }
    const t = typeof x
    if (t === 'number') { h.update(Object.is(x, -0) ? 'N-0' : 'N' + x); return }
    if (t === 'string') { h.update('S' + x.length + ':' + x); return }
    if (t === 'boolean') { h.update(x ? 'T' : 'F'); return }
    if (t === 'function') { h.update('f'); return }
    if (seen.has(x)) { h.update('cyc'); return }
    seen.add(x)
    if (x instanceof Set || x instanceof Map) { h.update(x instanceof Set ? 'Set[' : 'Map['); for (const e of x) walk(e); h.update(']') }
    else if (Array.isArray(x) || ArrayBuffer.isView(x)) { h.update('['); for (const e of x) walk(e); h.update(']') }
    else { h.update('{'); for (const k of Object.keys(x).sort()) { h.update('K' + k); walk(x[k]) } h.update('}') }
    seen.delete(x)
  }
  walk(v); return h.digest('hex').slice(0, 16)
}

const rec = { scene, look, sha: process.env.PROOF_SHA || null }
const t0 = performance.now()
try {
  const S = await bakeGround({ look, scene, stackOnly: true })
  rec.stack = hashOf(S.stackEntries)
} catch (e) { rec.refused = String(e?.message || e).split('\n')[0] }
rec.totalMs = Math.round(performance.now() - t0)
const pr = globalThis.__PR
if (pr) {
  rec.buildMs = Math.round(globalThis.__T1 - globalThis.__T0)
  rec.rssBeforeMB = Math.round(globalThis.__M0 / 1024)   // maxRSS is in KB (node)
  rec.rssPeakAfterBuildMB = Math.round(globalThis.__M1 / 1024)
  rec.fields = {}
  for (const k of Object.keys(pr).sort()) rec.fields[k] = hashOf(pr[k])
  if (pr._curbProducers) rec.a07 = pr._curbProducers.line
  rec.ribbonsAfter = hashOf(globalThis.__RIB)
  // STOP 2 — non-highway grade-separated chains, sampled every 1 m against the final asphalt ∪ highway
  const H = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
  const rings = [...(pr.asphalt || []), ...(pr.highway || [])]
  const boxes = rings.map(r => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] })
  const inside = (p) => { let w = 0; for (let k = 0; k < rings.length; k++) { const bb = boxes[k]; if (p[0] < bb[0] || p[0] > bb[2] || p[1] < bb[1] || p[1] > bb[3]) continue
    const r = rings[k]; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
      if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) w ^= 1 } } return !!w }   // even-odd over all rings
  const stencil = globalThis.__STENCIL
  const inStencil = (p) => { if (!stencil?.length) return true; let w = false; for (let i = 0, j = stencil.length - 1; i < stencil.length; j = i++) { const [xi, zi] = stencil[i], [xj, zj] = stencil[j]
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) w = !w } return w }
  rec.gsOther = []
  for (const s of (globalThis.__RIB?.streets || [])) {
    if (!s?.gradeSeparated || !(s.points?.length >= 2) || H.has(s.highway)) continue
    let n = 0, cov = 0
    for (let i = 0; i < s.points.length - 1; i++) { const a = s.points[i], b = s.points[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(L))
      for (let k = 0; k < m; k++) { const t = (k + 0.5) / m, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (!inStencil(p)) continue; n++; if (inside(p)) cov++ } }
    rec.gsOther.push({ id: s.skelId ?? s.name, highway: s.highway, samplesInStencil: n, covered: cov })
  }
}
console.log('PROOF ' + JSON.stringify(rec))
if (process.env.PROOF_OUT) fs.writeFileSync(process.env.PROOF_OUT, JSON.stringify(rec, null, 1))
