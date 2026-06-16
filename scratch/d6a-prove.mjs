// D6a proof: iA-as-offset (new default) vs iA-legacy-carve.
//   (1) the drawn-line target at Lafayette×Mississippi,
//   (2) map-wide blast radius (per-tile deviation offset vs legacy),
//   (3) straight-run litmus (should improve, never regress).
import fs from 'fs'
import path from 'path'
const ROOT = process.cwd()
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const marks = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/clean/marker_strokes.json')))
const target = Object.values(marks[0]).filter(p => p && typeof p.x === 'number').map(p => [p.x, p.z])

const cap = []
buildTileGround(ribbons, { stencil: null, curbWidth: 0.15, smooth: 0, _iaDebugCapture: cap })

function distToRings(pt, rings) { let best = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy))) } return best }
function score(rings) { const ds = target.map(p => distToRings(p, rings)); return { mean: ds.reduce((a, b) => a + b, 0) / ds.length, max: Math.max(...ds) } }
// max deviation of ring set P from ring set Q (sample P's vertices → nearest Q edge)
function dev(P, Q) { let mx = 0; for (const r of P) for (const v of r) mx = Math.max(mx, distToRings(v, Q)); return mx }

// (1) the drawn-line target
const tx0 = Math.min(...target.map(p => p[0])) - 15, tx1 = Math.max(...target.map(p => p[0])) + 15
const tz0 = Math.min(...target.map(p => p[1])) - 15, tz1 = Math.max(...target.map(p => p[1])) + 15
const near = (rings) => rings.some(r => r.some(p => p[0] > tx0 && p[0] < tx1 && p[1] > tz0 && p[1] < tz1))
console.log('=== (1) Lafayette×Mississippi — distance from Jacob’s drawn curb ===')
let best = null
for (let i = 0; i < cap.length; i++) { const t = cap[i]; if (!near(t.iA_legacy) && !near(t.iA_offset)) continue; const so = score(t.iA_offset); if (so.mean < 5 && (!best || so.mean < best.so.mean)) best = { i, so, sl: score(t.iA_legacy) } }
if (best) { console.log(`tile ${best.i} (the one carrying that curb):`); console.log(`   legacy carve:    mean ${best.sl.mean.toFixed(2)}m  max ${best.sl.max.toFixed(2)}m  off the drawn line`); console.log(`   offset (D6a):    mean ${best.so.mean.toFixed(2)}m  max ${best.so.max.toFixed(2)}m  off the drawn line`) }

// (2) map-wide blast radius
console.log('\n=== (2) map-wide blast radius (per-tile max deviation, offset vs legacy) ===')
const buckets = { '≤0.10 (unchanged)': 0, '0.10–0.50': 0, '0.50–2.0': 0, '2.0–5.0': 0, '>5.0': 0 }
let changed = []
for (let i = 0; i < cap.length; i++) { const t = cap[i]; const d = Math.max(dev(t.iA_offset, t.iA_legacy), dev(t.iA_legacy, t.iA_offset)); if (d <= 0.10) buckets['≤0.10 (unchanged)']++; else if (d <= 0.5) buckets['0.10–0.50']++; else if (d <= 2) buckets['0.50–2.0']++; else if (d <= 5) buckets['2.0–5.0']++; else buckets['>5.0']++; if (d > 0.5) changed.push({ i, d, c: t.iA_offset[0] ? t.iA_offset[0][0] : 0 }) }
for (const [k, v] of Object.entries(buckets)) console.log(`   ${k.padEnd(20)} ${v} tiles`)
console.log(`   tiles changing >0.5m: ${changed.length} of ${cap.length}`)

// (3) litmus (straight-run parallelism) offset vs legacy
console.log('\n=== (3) straight-run litmus (offset default vs legacy) ===')
const STEP = 0.5, MIN_RUN = 22, RAY_CAP = 4.5, MAX_TILE_SPAN = 250, TOL = 0.75, FILLET_MARGIN = 9
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], cross = (a, b) => a[0] * b[1] - a[1] * b[0], len = (a) => Math.hypot(a[0], a[1])
function rayHit(O, D, edges) { let best = Infinity; for (const [A, B] of edges) { const E = sub(B, A); const den = cross(E, D); if (Math.abs(den) < 1e-12) continue; const W = sub(A, O); const t = cross(E, W) / den; const s = cross(D, W) / den; if (t > 1e-4 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t } return best }
function litmus(legacy) {
  const pr = buildTileGround(ribbons, { stencil: null, curbWidth: 0.15, smooth: 0, emitArtifact: true, iaCarveLegacy: legacy })
  const tiles = pr._shapeArtifact || []; let v = 0
  for (const tile of tiles) { if (!tile?.iA?.length) continue; let xn = 1e9, xx = -1e9, yn = 1e9, yx = -1e9; for (const p of tile.ring) { xn = Math.min(xn, p[0]); xx = Math.max(xx, p[0]); yn = Math.min(yn, p[1]); yx = Math.max(yx, p[1]) } if (Math.hypot(xx - xn, yx - yn) > MAX_TILE_SPAN) continue; const edges = []; for (const ring of tile.iA) for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]]); for (const r of tile.runs || []) { const poly = r.poly; if (!poly || poly.length < 2) continue; let L = 0; for (let i = 1; i < poly.length; i++) L += len(sub(poly[i], poly[i - 1])); if (L < MIN_RUN) continue; const hwL = r.measure?.left?.pavementHW || 0, hwR = r.measure?.right?.pavementHW || 0; if (hwL < 0.5 && hwR < 0.5) continue; let worst = 0, along = 0; for (let i = 1; i < poly.length; i++) { const a = poly[i - 1], b = poly[i]; const segLen = len(sub(b, a)) || 1; const fwd = [(b[0] - a[0]) / segLen, (b[1] - a[1]) / segLen]; const leftN = [-fwd[1], fwd[0]], rightN = [fwd[1], -fwd[0]]; for (let d = 0; d <= segLen; d += STEP) { const aA = along + d; if (aA < FILLET_MARGIN || aA > L - FILLET_MARGIN) continue; const O = [a[0] + (b[0] - a[0]) * (d / segLen), a[1] + (b[1] - a[1]) * (d / segLen)]; let bb = Infinity, dev2 = null; for (const [nrm, hw] of [[leftN, hwL], [rightN, hwR]]) { if (!(hw > 0.5)) continue; const hit = rayHit(O, nrm, edges); if (!isFinite(hit) || hit < 0.1 || hit > hw + RAY_CAP) continue; if (hit < bb) { bb = hit; dev2 = Math.abs(hit - hw) } } if (dev2 != null && dev2 > worst) worst = dev2 } along += segLen } if (worst > TOL) v++ } }
  return v
}
const vLeg = litmus(true), vOff = litmus(false)
console.log(`   legacy carve: ${vLeg} straight-run violations`)
console.log(`   offset (D6a): ${vOff} straight-run violations   (Δ ${vOff - vLeg})`)
