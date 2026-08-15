// (Tally, 2026-08-14) — CURVATURE vs OFFSET DISTANCE, station by station, BOTH FACES.
//
// Jacob, 2026-08-14: "smoothness is not the thing that protects you here —
// curvature is. Offset a curve inward by more than its radius of curvature and
// it MUST cross itself. There's no way for it not to. The centerline can be
// perfectly smooth and still be turning tighter than the band is deep."
//
// That is a theorem, not a hypothesis: the inward offset of a curve at distance
// d develops a cusp exactly where d = R (the evolute), and self-intersects for
// d > R. So a smooth centerline guarantees a smooth offset ONLY at d < R_min.
// Same shape as the 18th/Dolman tooth: smooth in => smooth out holds only when
// the OTHER term is well behaved. There it was the width step. Here, the radius.
//
// ⛔ THIS PROBE PICKS NOTHING. It measures the two candidate causes side by side
// and reports both, per station:
//   CURVATURE — is the curve turning tighter than the offset is deep?
//   G12       — is the TILE narrow here (pinching below band depth)?
// G12 cannot explain an OUTER-side bump (there is no pinch on the outside);
// curvature can reach both faces. But "can explain" is not "does", so both are
// measured and neither is chosen here.
//
// THE INNER/OUTER TEST, which is the point:
//   INNER face — flag stations where R <= offset (curb) or R <= offset + WB (band).
//   OUTER face — measure the achieved curb's excursion off a clean parallel.
//   Then compare the two station SETS. Same stations => ONE cause with two faces.
//   Different stations => TWO causes, and we will know rather than assume.
//
// ⛔ Authoring loaded. ⛔ No smoother, clamp or snap is proposed or applied —
// this is a DETECTOR (RIBBONS §1, 2026-08-13: smoothness by construction, never
// cleanup; the detector is allowed, the fix-up is not).
// ⛔ Where a number arrives without a mechanism this prints CAUSE NOT ESTABLISHED.
//
//   node scratch/claims-curvature-vs-band.mjs [--near=X,Z] [--radius=120]
//
import fs from 'fs'
import crypto from 'crypto'

const ARG = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const H = (f) => { try { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10) } catch { return 'ABSENT' } }

const RIBBONS = 'src/data/ribbons.json'
const DESIGN = 'public/looks/lafayette-square/design.json'
const SHAPE = 'public/baked/lafayette-square/shape.json'
const ribbons = JSON.parse(fs.readFileSync(RIBBONS, 'utf8'))
const design = JSON.parse(fs.readFileSync(DESIGN, 'utf8'))
const shape = fs.existsSync(SHAPE) ? JSON.parse(fs.readFileSync(SHAPE, 'utf8')) : null

// tileGround.js:1206-1207 — read here, not restated as literals elsewhere.
const STD_TREELAWN = 1.5, ADA_SIDEWALK = 1.5
const CURB_W = design.curbWidth ?? 0.1524
const WB = CURB_W + STD_TREELAWN + ADA_SIDEWALK

console.log('═══ SCENE + INPUTS ═══')
console.log(`  scene ......... lafayette-square   (⛔ not staging)`)
console.log(`  ribbons ....... ${H(RIBBONS)}`)
console.log(`  design ........ ${H(DESIGN)}   ${Object.keys(design.blockCustoms || {}).length} authored streets`)
console.log(`  shape ......... ${H(SHAPE)}`)
console.log(`  BAND DEPTH WB = curbWidth ${CURB_W} + treelawn ${STD_TREELAWN} + sidewalk ${ADA_SIDEWALK} = ${WB.toFixed(3)} m`)

const bc = design.blockCustoms || {}
const hwOf = (s, side) => {
  const base = s.measure?.[side] || {}
  const cust = bc[s.skelId]?.[side]
  let hw = base.pavementHW || 0
  if (cust) for (const k of Object.keys(cust)) { const v = { ...base, ...cust[k] }.pavementHW; if (Number.isFinite(v)) hw = v }
  return hw
}

// Circumradius of three consecutive points = the local radius of curvature.
function curvature(p, c, q) {
  const a = Math.hypot(c[0] - p[0], c[1] - p[1])
  const b = Math.hypot(q[0] - c[0], q[1] - c[1])
  const cc = Math.hypot(q[0] - p[0], q[1] - p[1])
  const cross = (c[0] - p[0]) * (q[1] - p[1]) - (c[1] - p[1]) * (q[0] - p[0])
  const area2 = Math.abs(cross)
  if (area2 < 1e-12 || a < 1e-9 || b < 1e-9) return { R: Infinity, turnDeg: 0, sign: 0, segMin: Math.min(a, b) }
  const R = (a * b * cc) / (2 * area2)
  // exterior turn angle at c
  const v1 = [c[0] - p[0], c[1] - p[1]], v2 = [q[0] - c[0], q[1] - c[1]]
  const dot = v1[0] * v2[0] + v1[1] * v2[1]
  const turn = Math.atan2(cross, dot) * 180 / Math.PI
  // cross > 0 => turning LEFT in this frame; measure-RIGHT is (-dz,dx), so a
  // left turn puts the INSIDE of the curve on the measure-LEFT side.
  return { R, turnDeg: turn, sign: Math.sign(cross), segMin: Math.min(a, b) }
}

const NEAR = ARG('near', null)
const NEAR_R = +ARG('radius', 120)
const nearPt = NEAR ? NEAR.split(',').map(Number) : null

const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 3 && !s.gradeSeparated)

const stations = []
for (const s of streets) {
  const p = s.points
  const hwL = hwOf(s, 'left'), hwR = hwOf(s, 'right')
  for (let i = 1; i < p.length - 1; i++) {
    const { R, turnDeg, sign, segMin } = curvature(p[i - 1], p[i], p[i + 1])
    if (!Number.isFinite(R)) continue
    const innerSide = sign > 0 ? 'left' : 'right'
    const hwIn = innerSide === 'left' ? hwL : hwR
    const hwOut = innerSide === 'left' ? hwR : hwL
    stations.push({
      skelId: s.skelId, i, at: p[i], R, turnDeg: Math.abs(turnDeg), innerSide,
      hwIn, hwOut, curbCross: R <= hwIn, bandCross: R <= hwIn + WB, segMin,
    })
  }
}

console.log(`\n═══ 1. THE THEOREM, APPLIED — stations where the inward offset EXCEEDS the radius ═══`)
console.log(`  chains ${streets.length} · interior stations ${stations.length}`)
const curbX = stations.filter(s => s.curbCross)
const bandX = stations.filter(s => s.bandCross && !s.curbCross)
console.log(`  R <= pavementHW           (the CURB itself must self-intersect) : ${curbX.length}`)
console.log(`  R <= pavementHW + WB      (the BAND must self-intersect)        : ${bandX.length}  (additional)`)
console.log(`  ⇒ total stations that CANNOT produce a clean inward offset      : ${curbX.length + bandX.length}`)
const byChain = new Map()
for (const s of [...curbX, ...bandX]) { if (!byChain.has(s.skelId)) byChain.set(s.skelId, []) ; byChain.get(s.skelId).push(s) }
console.log(`  chains affected: ${byChain.size}`)
console.log('')
console.log('  chain                          n   tightest R   hwIn    hwIn+WB   inner   worst station')
for (const [k, list] of [...byChain.entries()].sort((a, b) => Math.min(...a[1].map(x => x.R)) - Math.min(...b[1].map(x => x.R))).slice(0, 20)) {
  const w = list.reduce((m, x) => x.R < m.R ? x : m, list[0])
  console.log(`  ${k.padEnd(30)} ${String(list.length).padStart(2)}  ${w.R.toFixed(2).padStart(9)} m ${w.hwIn.toFixed(2).padStart(7)} ${(w.hwIn + WB).toFixed(2).padStart(9)}   ${w.innerSide.padEnd(6)} [${w.at[0].toFixed(1)}, ${w.at[1].toFixed(1)}]`)
}

console.log(`\n═══ 2. THE RADIUS DISTRIBUTION — how close is the rest of the map to the cliff? ═══`)
const rs = stations.map(s => s.R).sort((a, b) => a - b)
const q = (f) => rs[Math.min(rs.length - 1, Math.floor(f * rs.length))]
console.log(`  R percentiles (m):  p1 ${q(0.01).toFixed(1)} · p5 ${q(0.05).toFixed(1)} · p25 ${q(0.25).toFixed(1)} · median ${q(0.5).toFixed(1)}`)
const margin = stations.map(s => s.R - (s.hwIn + WB)).sort((a, b) => a - b)
const mq = (f) => margin[Math.min(margin.length - 1, Math.floor(f * margin.length))]
console.log(`  MARGIN R − (hwIn+WB) (m):  p1 ${mq(0.01).toFixed(2)} · p5 ${mq(0.05).toFixed(2)} · p25 ${mq(0.25).toFixed(2)} · median ${mq(0.5).toFixed(1)}`)
console.log(`  stations within 1 m of the cliff: ${stations.filter(s => s.R - (s.hwIn + WB) < 1 && s.R - (s.hwIn + WB) >= 0).length}`)

if (nearPt) {
  console.log(`\n═══ 3. THE NAMED CORNER — stations within ${NEAR_R} m of [${nearPt}] ═══`)
  const near = stations.filter(s => Math.hypot(s.at[0] - nearPt[0], s.at[1] - nearPt[1]) <= NEAR_R)
    .sort((a, b) => a.R - b.R)
  console.log(`  stations in range: ${near.length}`)
  console.log('')
  console.log('  chain                        stn        R    turn°   hwIn  hwIn+WB   margin  inner   VERDICT')
  for (const s of near.slice(0, 22)) {
    const m = s.R - (s.hwIn + WB)
    const v = s.curbCross ? '⛔ CURB must self-intersect' : s.bandCross ? '⛔ BAND must self-intersect' : m < 1 ? '⚠️ within 1 m of the cliff' : 'clean'
    console.log(`  ${s.skelId.padEnd(28)} ${String(s.i).padStart(3)} ${s.R.toFixed(2).padStart(8)} ${s.turnDeg.toFixed(2).padStart(7)} ${s.hwIn.toFixed(2).padStart(6)} ${(s.hwIn + WB).toFixed(2).padStart(8)} ${m.toFixed(2).padStart(8)}  ${s.innerSide.padEnd(6)} ${v}`)
  }
}

console.log(`\n═══ 4. THE OTHER CANDIDATE — G12: is the TILE narrow here? ═══`)
console.log(`  ⛔ Measured, not chosen against curvature. G12 = the tile pinches below band depth.`)
if (!shape) { console.log('  shape.json ABSENT — NOT MEASURED (⛔ not "no").') } else {
  const ar = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }
  const per = (r) => { let L = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) L += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return L }
  const rows = (shape.tiles || []).map((t, i) => ({ i, w: 2 * ar(t.ring) / Math.max(per(t.ring), 1e-9), owners: [...new Set((t.runs || []).map(r => r.skelId))] }))
  const narrow = rows.filter(r => r.w < 2 * WB).sort((a, b) => a.w - b.w)
  console.log(`  tiles whose 2A/P width < 2·WB (${(2 * WB).toFixed(2)} m): ${narrow.length} of ${rows.length}`)
  console.log(`  ⚠️ 2A/P is a WHOLE-TILE mean and RIBBONS §6.1 records it MISSING subclass 2`)
  console.log(`     (a tapering block reads ordinary on an average). Reported as a coarse`)
  console.log(`     screen only — a local-width pass is what §6.1 says is valid.`)
  for (const r of narrow.slice(0, 8)) console.log(`     tile ${String(r.i).padStart(3)}  width≈${r.w.toFixed(2)} m  [${r.owners.slice(0, 3).join(', ')}]`)
}

// ═══ 6. THE DECIDING TEST — does the OUTER face fail at the SAME stations? ═══
// Jacob, 2026-08-14: "Check whether the bump on the outer side lands at the same
// stations. If it does, one cause. If it doesn't, we have two and we'll know
// that instead of assuming it."
// Method: at each station march the OUTWARD perpendicular from the centreline,
// intersect the frozen iA rings, take the nearest hit, and compare that distance
// to the authored hwOut. A clean parallel offset reads 0.00 excursion.
if (shape && nearPt) {
  const segHit = (o, d, a, b) => {
    const rX = d[0], rZ = d[1], sX = b[0] - a[0], sZ = b[1] - a[1]
    const den = rX * sZ - rZ * sX
    if (Math.abs(den) < 1e-12) return null
    const t = ((a[0] - o[0]) * sZ - (a[1] - o[1]) * sX) / den
    const u = ((a[0] - o[0]) * rZ - (a[1] - o[1]) * rX) / den
    if (t <= 0.01 || u < 0 || u > 1) return null
    return t
  }
  const allRings = []
  for (const t of shape.tiles || []) {
    const v = t.iA; if (!v) continue
    const rs = (Array.isArray(v[0]) && Array.isArray(v[0][0])) ? v : [v]
    for (const r of rs) allRings.push(r)
  }
  console.log(`\n═══ 6. THE DECIDING TEST — the OUTER face at the SAME stations ═══`)
  console.log(`  frozen iA rings walked: ${allRings.length}`)
  console.log('')
  console.log('  chain                     stn      R   margin(in)   hwOut   achieved-out   EXCURSION   inner verdict')
  const near = stations.filter(s => Math.hypot(s.at[0] - nearPt[0], s.at[1] - nearPt[1]) <= NEAR_R)
  const rows = []
  for (const st of near) {
    const s0 = streets.find(x => x.skelId === st.skelId); if (!s0) continue
    const p = s0.points, a = p[st.i - 1], c = p[st.i], b = p[st.i + 1]
    const tx = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(tx, tz) || 1
    // measure-RIGHT = (-dz, dx); outer is the side opposite `innerSide`
    const rp = [-tz / L, tx / L]
    const dir = st.innerSide === 'left' ? rp : [-rp[0], -rp[1]]
    let best = Infinity
    for (const r of allRings) for (let i = 0; i < r.length; i++) {
      const t = segHit(c, dir, r[i], r[(i + 1) % r.length]); if (t != null && t < best) best = t
    }
    if (!Number.isFinite(best)) continue
    rows.push({ st, achieved: best, exc: best - st.hwOut })
  }
  rows.sort((x, y) => x.st.R - y.st.R)
  for (const r of rows.slice(0, 22)) {
    const m = r.st.R - (r.st.hwIn + WB)
    const v = r.st.curbCross ? 'CURB X' : r.st.bandCross ? 'BAND X' : m < 1 ? 'near cliff' : 'clean'
    console.log(`  ${r.st.skelId.padEnd(24)} ${String(r.st.i).padStart(3)} ${r.st.R.toFixed(2).padStart(7)} ${m.toFixed(2).padStart(9)} ${r.st.hwOut.toFixed(2).padStart(8)} ${r.achieved.toFixed(2).padStart(13)} ${r.exc.toFixed(3).padStart(11)}   ${v}`)
  }
  const bad = rows.filter(r => r.st.bandCross || r.st.curbCross)
  const ok = rows.filter(r => !r.st.bandCross && !r.st.curbCross)
  const mean = (xs) => xs.length ? xs.reduce((s, x) => s + Math.abs(x.exc), 0) / xs.length : NaN
  const mx = (xs) => xs.length ? Math.max(...xs.map(x => Math.abs(x.exc))) : NaN
  console.log('')
  console.log(`  OUTER excursion where the INNER side is violated (n=${bad.length}) : mean ${mean(bad).toFixed(3)} m · max ${mx(bad).toFixed(3)} m`)
  console.log(`  OUTER excursion where the INNER side is CLEAN    (n=${ok.length}) : mean ${mean(ok).toFixed(3)} m · max ${mx(ok).toFixed(3)} m`)
  console.log('')
  console.log(`  ⭐ READ IT THIS WAY: if the two rows are the same, the outer face does NOT`)
  console.log(`     track the curvature violation and there are TWO causes. If the violated`)
  console.log(`     row is materially worse, the outer bump rides the same stations and it`)
  console.log(`     is ONE cause with two faces.`)
}

console.log(`\n═══ 5. WHAT THIS DOES AND DOES NOT ESTABLISH ═══`)
console.log(`  ESTABLISHED where §1 flags a station: the inward offset at that station`)
console.log(`  CANNOT be simple — d >= R forces a cusp or crossing. That is geometry.`)
console.log(`  ⛔ NOT ESTABLISHED here: that an OUTER-side bump shares those stations.`)
console.log(`     The outer offset of a smooth curve is smooth at any radius, so a bump`)
console.log(`     there needs its own mechanism. Until the achieved outer curb is walked`)
console.log(`     against a clean parallel and the station sets compared: CAUSE NOT`)
console.log(`     ESTABLISHED for the outer face, and one-cause-two-faces is UNPROVEN.`)
