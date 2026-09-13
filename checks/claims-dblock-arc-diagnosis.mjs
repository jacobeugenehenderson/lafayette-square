// (Tally, 2026-08-14) — THE D-BLOCK ARC: two candidate mechanisms, measured side
// by side, on the tile found BY GEOMETRY. ⛔ MEASURE ONLY. Nothing is repaired,
// nothing deleted, no smoother/simplifier/snap/clamp — not even "for the
// measurement" (RIBBONS §1, RULED 2026-08-13).
//
// THE SHAPE, in Jacob's words (2026-08-14): "a D-shaped block: 2 corners made in
// the ordinary way, and then a bent arc as the other two corners. The street
// might change names or it might not. But the curved part will leave a confusing
// polygon that isn't the same as all the rest."
//
// THE SYMPTOM: inner side of the arc — a fan of thin spikes; outer side — a bump;
// the centreline through it — smooth. ⛔ Not to be treated as two defects until
// co-location is tested.
//
// ⛔ THE SPIKES ARE IN THE PED BAND (`tl` / `sw` in shape.json), painted inward
// from the frozen curb by sectionPass — FILL, not the curb. The 18th/Dolman tooth
// was the CURB. Different layer, drawn from it. This probe measures the band.
//
// TWO CANDIDATES, MEASURED, NOT PICKED:
//   PINCH (RIBBONS §6.1 G12) — the tile's interior narrows below band depth WB.
//     ⛔ Measured as LOCAL width (shortest chord to a non-adjacent ring edge).
//     §6.1 is explicit that the whole-tile mean 2A/P MISSES subclass 2 because a
//     tapering block reads ordinary on an average.
//   CURVATURE — the ring turns tighter than the band is deep. Offset a curve
//     inward by d > R and it must cross itself (the evolute). Geometry, not tuning.
//
// ⛔ TILE FOUND BY GEOMETRY, NEVER BY INDEX and never by asking the street graph
// which chain is nearest a point (CLAUDE.md: that is proximity recovery of a chain
// label, the forbidden third recovery). Direction of travel here:
//   a named chain's OWN points (name → coordinate, allowed)
//     → step off the arc → the tile whose RING CONTAINS that point (point-in-poly)
//       → measure that ring → name the owners LAST, off tile.runs, as a label.
//
// ⛔ Absence is a claim: every count below walks parsed structure. No string greps.
//
//   node scratch/claims-dblock-arc-diagnosis.mjs [--arc=west-18th-street]
//
import fs from 'fs'
import crypto from 'crypto'

const CHILLERED = new Set(['ksi-y-m-yn', 'centrum'])
const SCENE = 'lafayette-square'
if (CHILLERED.has(SCENE)) { console.log(`${SCENE}: CHILLERED — not measured.`); process.exit(0) }

const ARG = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const H = (f) => { try { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10) } catch { return 'ABSENT' } }

const R_PATH = 'src/data/ribbons.json', D_PATH = `public/looks/${SCENE}/design.json`, S_PATH = `public/baked/${SCENE}/shape.json`
const ribbons = JSON.parse(fs.readFileSync(R_PATH, 'utf8'))
const design = JSON.parse(fs.readFileSync(D_PATH, 'utf8'))
const shape = JSON.parse(fs.readFileSync(S_PATH, 'utf8'))

const STD_TREELAWN = 1.5, ADA_SIDEWALK = 1.5              // tileGround.js:1206-1207
const CURB_W = design.curbWidth ?? 0.1524
const WB = CURB_W + STD_TREELAWN + ADA_SIDEWALK

console.log('═══ SCENE + INPUTS ═══')
console.log(`  scene ..... ${SCENE}  (⛔ not staging)`)
console.log(`  ribbons ... ${H(R_PATH)}   design ... ${H(D_PATH)}   shape ... ${H(S_PATH)}`)
console.log(`  WB = curb ${CURB_W} + treelawn ${STD_TREELAWN} + sidewalk ${ADA_SIDEWALK} = ${WB.toFixed(3)} m`)
console.log(`  ⚠️ WB uses the DEFAULT ped depths. Where an operator authored deeper, the`)
console.log(`     real inner offset is larger and every margin below is optimistic.`)

// ── geometry primitives
const inRing = (p, r) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) s = !s } return s }
const ar = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const L = dx * dx + dz * dz; let t = L > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)) }
const circumR = (p, c, q) => {
  const a = Math.hypot(c[0] - p[0], c[1] - p[1]), b = Math.hypot(q[0] - c[0], q[1] - c[1]), cc = Math.hypot(q[0] - p[0], q[1] - p[1])
  const cross = (c[0] - p[0]) * (q[1] - p[1]) - (c[1] - p[1]) * (q[0] - p[0])
  if (Math.abs(cross) < 1e-12 || a < 1e-9 || b < 1e-9) return { R: Infinity, sign: 0 }
  return { R: (a * b * cc) / (2 * Math.abs(cross)), sign: Math.sign(cross) }
}
// LOCAL width at a ring vertex — RIBBONS §6.1's OWN method: an INWARD RAY from
// the curb sample to the far side of the tile.
// ⛔ NOT 2A/P (§6.1: a tapering block reads ordinary on a mean), and ⛔ NOT
// "nearest non-adjacent edge" — I tried that first and it is a BAD PROXY: on a
// 269-vertex ring the near-in-index neighbours sit centimetres away, so it
// returns VERTEX SPACING, not tile width, and reported 258/269 stations as
// pinched on an 81,698 m² block. Struck rather than reported.
const rayHit = (o, d, a, b) => {
  const rX = d[0], rZ = d[1], sX = b[0] - a[0], sZ = b[1] - a[1]
  const den = rX * sZ - rZ * sX
  if (Math.abs(den) < 1e-12) return null
  const t = ((a[0] - o[0]) * sZ - (a[1] - o[1]) * sX) / den
  const u = ((a[0] - o[0]) * rZ - (a[1] - o[1]) * rX) / den
  if (t <= 1e-6 || u < 0 || u > 1) return null
  return t
}
const localWidth = (r, i) => {
  const n = r.length
  const p = r[(i - 1 + n) % n], c = r[i], q = r[(i + 1) % n]
  const tx = q[0] - p[0], tz = q[1] - p[1]; const L = Math.hypot(tx, tz); if (L < 1e-9) return Infinity
  const sgn = ar(r) >= 0 ? 1 : -1                 // inward normal depends on winding
  const nrm = [sgn * tz / L, -sgn * tx / L]
  let best = Infinity
  for (let j = 0; j < n; j++) {
    if (j === i || (j + 1) % n === i) continue
    const t = rayHit(c, nrm, r[j], r[(j + 1) % n]); if (t != null && t < best) best = t
  }
  return best
}
const ringsOf = (t, key) => { const v = t[key]; if (!v || !v.length) return []; return (Array.isArray(v[0]) && Array.isArray(v[0][0])) ? v : [v] }
// a SPIKE = a vertex whose interior angle is very sharp (a thorn), measured
// structurally on the parsed polygon.
const spikeVerts = (r, degThresh = 15) => {
  const out = []
  for (let i = 0; i < r.length; i++) {
    const p = r[(i - 1 + r.length) % r.length], c = r[i], q = r[(i + 1) % r.length]
    const v1 = [p[0] - c[0], p[1] - c[1]], v2 = [q[0] - c[0], q[1] - c[1]]
    const L1 = Math.hypot(...v1), L2 = Math.hypot(...v2)
    if (L1 < 1e-9 || L2 < 1e-9) continue
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (L1 * L2)))) * 180 / Math.PI
    if (ang < degThresh) out.push({ i, ang, at: c })
  }
  return out
}

// ── 1. THE ARC, from its own points (name → coordinate)
const ARC = ARG('arc', 'west-18th-street')
const arc = (ribbons.streets || []).find(s => s.skelId === ARC)
if (!arc) { console.log(`\n⛔ NOT MEASURED — no chain ${ARC} in ${R_PATH}`); process.exit(2) }
const P = arc.points
console.log(`\n═══ 1. THE ARC ═══`)
console.log(`  ${ARC}: ${P.length} points, [${P[0].map(v => v.toFixed(1))}] → [${P[P.length - 1].map(v => v.toFixed(1))}]`)
let arcLen = 0; for (let i = 1; i < P.length; i++) arcLen += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
console.log(`  length ${arcLen.toFixed(1)} m · mean station spacing ${(arcLen / (P.length - 1)).toFixed(2)} m`)

// ── 2. FIND THE TWO TILES BY GEOMETRY (never by index, never by name)
const mid = Math.floor(P.length / 2)
const tx = P[mid + 1][0] - P[mid - 1][0], tz = P[mid + 1][1] - P[mid - 1][1]
const TL = Math.hypot(tx, tz) || 1
const rp = [-tz / TL, tx / TL]                                  // measure-RIGHT
const { sign } = circumR(P[mid - 1], P[mid], P[mid + 1])
const innerDir = sign > 0 ? [-rp[0], -rp[1]] : rp               // toward the inside of the curve
const STEP = 12                                                  // clear of the road, into the block
const probeIn = [P[mid][0] + innerDir[0] * STEP, P[mid][1] + innerDir[1] * STEP]
const probeOut = [P[mid][0] - innerDir[0] * STEP, P[mid][1] - innerDir[1] * STEP]
const findTile = (pt) => {
  const hits = []
  shape.tiles.forEach((t, idx) => { if (t.ring && inRing(pt, t.ring)) hits.push({ idx, t }) })
  return hits
}
const inHits = findTile(probeIn), outHits = findTile(probeOut)
const nameOwners = (t) => [...new Set((t.runs || []).map(r => `${r.skelId}|${r.side}`))]
console.log(`\n═══ 2. THE TILES, FOUND BY GEOMETRY (point-in-ring) ═══`)
console.log(`  ⛔ tile INDEX is printed only as a handle; it is never how a tile was found.`)
console.log(`  inner probe  [${probeIn.map(v => v.toFixed(1))}] → ${inHits.length} tile(s)`)
for (const h of inHits) console.log(`     tile#${h.idx}  area ${Math.abs(ar(h.t.ring)).toFixed(0)} m²  ring ${h.t.ring.length} verts  owners: ${nameOwners(h.t).slice(0, 6).join(', ')}`)
console.log(`  outer probe  [${probeOut.map(v => v.toFixed(1))}] → ${outHits.length} tile(s)`)
for (const h of outHits) console.log(`     tile#${h.idx}  area ${Math.abs(ar(h.t.ring)).toFixed(0)} m²  ring ${h.t.ring.length} verts  owners: ${nameOwners(h.t).slice(0, 6).join(', ')}`)
if (!inHits.length) { console.log('\n⛔ NOT MEASURED — the inner probe landed in no tile. Not "no defect".'); process.exit(2) }

// ── 3. THE INNER TILE — both candidates, station by station along its iA
const T = inHits[0].t, TIDX = inHits[0].idx
console.log(`\n═══ 3. INNER TILE #${TIDX} — PINCH vs CURVATURE, station by station ═══`)
const iAr = ringsOf(T, 'iA')
console.log(`  iA rings ${iAr.length} · vertices ${iAr.reduce((s, r) => s + r.length, 0)}`)
const rows = []
for (const r of iAr) for (let i = 0; i < r.length; i++) {
  const w = localWidth(r, i)
  const { R } = circumR(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
  // only score stations that lie along the arc (within half a block of it)
  let dArc = Infinity; for (let k = 0; k + 1 < P.length; k++) { const d = dSeg(r[i], P[k], P[k + 1]); if (d < dArc) dArc = d }
  rows.push({ i, at: r[i], w, R, dArc, pinch: w < WB, tight: R < WB })
}
const onArc = rows.filter(x => x.dArc < 25).sort((a, b) => a.w - b.w)
console.log(`  stations on the iA within 25 m of the arc: ${onArc.length}`)
console.log(`  PINCH   local width < WB (${WB.toFixed(2)} m) : ${rows.filter(x => x.pinch).length} of ${rows.length}  (on-arc: ${onArc.filter(x => x.pinch).length})`)
console.log(`  CURVE   local ring R < WB                : ${rows.filter(x => x.tight).length} of ${rows.length}  (on-arc: ${onArc.filter(x => x.tight).length})`)
console.log('')
console.log('  station        local width    ring R    dist-to-arc   pinch?  tight?')
for (const x of onArc.slice(0, 16)) console.log(`  [${x.at[0].toFixed(1)}, ${x.at[1].toFixed(1)}]`.padEnd(24) + `${x.w.toFixed(2).padStart(8)} m ${(x.R === Infinity ? '   inf' : x.R.toFixed(2)).padStart(9)} ${x.dArc.toFixed(1).padStart(11)} m   ${x.pinch ? 'YES' : ' no'}     ${x.tight ? 'YES' : ' no'}`)

// ── 4. THE BAND — ⛔ IT IS NOT IN THIS ARTIFACT. Measured structurally.
console.log(`\n═══ 4. THE BAND (the layer the spikes are IN) ═══`)
{
  // ABSENCE IS A CLAIM. Counted over parsed structure across every tile.
  let tlRings = 0, swRings = 0, tlNum = 0, swNum = 0
  for (const t of shape.tiles) {
    if (Array.isArray(t.tl)) tlRings++; else if (typeof t.tl === 'number') tlNum++
    if (Array.isArray(t.sw)) swRings++; else if (typeof t.sw === 'number') swNum++
  }
  console.log(`  over ${shape.tiles.length} tiles: tl is an ARRAY on ${tlRings}, a NUMBER on ${tlNum}`)
  console.log(`                        sw is an ARRAY on ${swRings}, a NUMBER on ${swNum}`)
  console.log(`  ⛔ tl / sw are DEPTHS (scalars), not polygons. shape.json freezes the CURB`)
  console.log(`     (iA) plus the depths; the ped band is generated DOWNSTREAM by sectionPass.`)
  console.log(`  ⇒ THE SPIKES CANNOT BE DIAGNOSED FROM shape.json. Measuring them requires`)
  console.log(`     running sectionPass, not reading the frozen artifact.`)
  console.log(`  ⚠️ My first pass read these scalars as ring arrays and printed 0 spikes on`)
  console.log(`     every tile. That was a FALSE ZERO, not a clean bill. Struck.`)
  const keys = Object.keys(shape.tiles[0] || {})
  console.log(`  tile fields actually present: ${keys.join(', ')}`)
}

console.log(`\n═══ 5. CO-LOCATION — ⛔ NOT MEASURED ═══`)
console.log(`  The inner spikes and the outer bump both live in the ped band, and the band`)
console.log(`  is not in this artifact (§4). So the co-location question the ticket turns on`)
console.log(`  CANNOT be answered from shape.json, and I am not going to answer it from the`)
console.log(`  curb and call it the band.`)
console.log(`  ⛔ ONE CAUSE vs TWO: NOT ESTABLISHED. What is needed is sectionPass run over`)
console.log(`     these two tiles, with its output polygons walked for spikes.`)

console.log(`\n═══ 6. ⚠️ A CONTRADICTION FOR BOZ — ⛔ NOT RESOLVED HERE ═══`)
console.log(`  RIBBONS §6.1 prescribes G12's cure as a "LOCAL capacity clamp".`)
console.log(`  RIBBONS §1 (RULED 2026-08-13) forbids clamps outright: "a guard that fires`)
console.log(`  when a construction degenerates and substitutes something plausible is a`)
console.log(`  cleanup patch living inside the construction."`)
console.log(`  The miter clamp on the 18th/Dolman tooth was exactly that shape and it WAS`)
console.log(`  the artifact. These two cannot both stand. ⛔ Not picked here — it is a`)
console.log(`  ruling, and it goes to Boz with both code sites.`)
