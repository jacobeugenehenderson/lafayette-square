#!/usr/bin/env node
/**
 * READ-ONLY. ⭐ SCOPE, and it is the whole point of this file:
 *
 *   ⛔ AN OFFSET CAN ONLY BE MEASURED FROM A LEG, NEVER FROM A CAP (Jacob, 2026-09-04).
 *   A cap has NO authored value — it is what falls out of two leg offsets plus a coupler.
 *   Measuring a cap against an expected radius INVENTS a specification and then reports
 *   deviations from it as findings. This file therefore measures ONE thing: does the
 *   boundary sit at the half-width the producer was authored, ALONG THE LEG.
 *
 * ⛔ AND A ZERO GAP AT A TIP IS THE DEFECT, NOT THE PASS. A dead-end spur's mouth has TWO
 * corners, one per side; at zero width they collapse to ONE node. So `gap = 0.000` does not
 * mean "seamlessly joined", it means "never opened". ▶ that is already measured — do not
 * rebuild it: `node scratch/coupler-slit-universal.mjs` (50/50 tips FACE=SLIT, gap 0.000)
 * and `POLYGON-FIRST §2.1` Check 5 (the mouth corner), Check 1-2 (the tip slit).
 *
 * ⭐ Portable to town #2: the expectation is the producer's OWN per-run `measure`, station-
 * local. An asymmetric or narrow or re-widened spur PASSES. No constant, no street knowledge.
 * ⛔ Stops sampling at an AUTHORED width change rather than averaging across it.
 * ⭐ No cap-style branch: the cap is not measured, so `round` vs `blunt` never arises here.
 *
 *   node checks/claims-spur-leg-offset.mjs [scene]
 *
 * Sibling (the ray-march form of the same question, per station): claims-deadend-notch-standoff.mjs
 */
import fs from 'fs'
import crypto from 'crypto'

const scene = process.argv[2] || 'lafayette-square'
const SHAPE = `public/baked/${scene}/shape.json`
const RIB = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const o = console.log
if (!fs.existsSync(SHAPE) || !fs.existsSync(RIB)) { o(`missing artifact: ${!fs.existsSync(SHAPE) ? SHAPE : RIB}`); process.exit(1) }
const RAW = fs.readFileSync(SHAPE)
const sh = JSON.parse(RAW), rb = JSON.parse(fs.readFileSync(RIB, 'utf8'))
o(`scene ${scene}   shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}`)

const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
const stBy = new Map(rb.streets.map(s => [s.skelId || s.name, s]))
const distToRings = (p, rings) => { let b = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length], ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez || 1; let u = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u)); b = Math.min(b, Math.hypot(p[0] - (a[0] + ex * u), p[1] - (a[1] + ez * u))) } return b }
function hwAt(tile, skelId, q) {
  const out = {}
  for (const r of (tile.runs || [])) {
    if (r.skelId !== skelId) continue
    let best = Infinity
    for (let i = 0; i < r.poly.length - 1; i++) {
      const a = r.poly[i], b = r.poly[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
      let u = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u))
      best = Math.min(best, Math.hypot(q[0] - (a[0] + ex * u), q[1] - (a[1] + ez * u)))
    }
    const hw = r.measure?.[r.side]?.pavementHW
    if (best < 0.5 && Number.isFinite(hw)) out[r.side] = +hw
  }
  return out
}

const LEG = 20, STEP = 0.25, TOL = 0.10
// The side convention is a CLAIM. Score the whole map under each forced sign and let the
// map choose — never per cap, which is fitting, not deriving.
function score(sign) {
  const rows = []
  sh.tiles.forEach((t, ti) => {
    const rings = t.iA || []; if (!rings.length) return
    for (const c of (rb.tiles[ti]?.caps || [])) {
      const st = stBy.get(c.skelId); if (!st) continue
      const tipAtStart = c.capEnd !== 'end'
      const tip = tipAtStart ? st.points[0] : st.points.at(-1)
      const hw0 = hwAt(t, c.skelId, tip)
      if (!Number.isFinite(hw0.left) || !Number.isFinite(hw0.right)) continue
      const pts = tipAtStart ? st.points : [...st.points].reverse()
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + d(pts[i - 1], pts[i])
      const total = cum.at(-1)
      const at = s => { for (let i = 1; i < pts.length; i++) if (cum[i] >= s || i === pts.length - 1) { const a = pts[i - 1], b = pts[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (s - cum[i - 1]) / L; return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] } } return null }
      const flip = tipAtStart ? 1 : -1
      let max = 0, n = 0, stopped = false, stopAt = Math.min(LEG, total)
      for (let s = 0; s <= Math.min(LEG, total); s += STEP) {
        const stn = at(s); if (!stn) continue
        const h = hwAt(t, c.skelId, stn.p)
        if (s > 0 && (!Number.isFinite(h.left) || !Number.isFinite(h.right) ||
                      Math.abs(h.left - hw0.left) > 0.01 || Math.abs(h.right - hw0.right) > 0.01)) { stopped = true; stopAt = s; break }
        const T = [stn.t[0] * flip, stn.t[1] * flip], R = [sign * T[1], -sign * T[0]]
        max = Math.max(max, distToRings([stn.p[0] - R[0] * hw0.left, stn.p[1] - R[1] * hw0.left], rings))
        max = Math.max(max, distToRings([stn.p[0] + R[0] * hw0.right, stn.p[1] + R[1] * hw0.right], rings))
        n += 2
      }
      rows.push({ id: c.skelId, ti, max, n, stopped, stopAt, prod: t.producer || '?', hwL: hw0.left, hwR: hw0.right })
    }
  })
  return rows
}
const A = score(+1), B = score(-1)
// ⛔ AN EMPTY SAMPLE IS NOT A NUMBER. This used to index an empty array, hand back
// `undefined`, and die on `.toFixed` — so a scene with no scorable leg CRASHED the
// check instead of reporting that it had nothing to measure. A crash tells you
// nothing about the map; it is wiring debt wearing a finding's clothes.
// ⛔ The fix is NOT a default. Returning 0 here would print "median 0.000 m" for a
// scene that measured nothing, which is the plausible-looking success Layer 0 forbids.
// `null` forces the caller to say NOT MEASURED out loud.
const q = (a, f) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * f)] }
const m3 = v => v == null ? 'n/a' : v.toFixed(3)
o(`\nLEG OFFSET — is the boundary at the AUTHORED half-width, along the leg? (${LEG} m window, ${STEP} m step, tol ${TOL} m)`)
for (const [nm, rows] of [['+1', A], ['-1', B]])
  o(rows.length
    ? `   forced side-sign ${nm}: PASS ${rows.filter(r => r.max < TOL).length}/${rows.length}   median ${m3(q(rows.map(r => r.max), .5))} m   p90 ${m3(q(rows.map(r => r.max), .9))} m   worst ${m3(Math.max(...rows.map(r => r.max)))} m`
    : `   forced side-sign ${nm}: ⛔ NOT MEASURED — 0 legs scored on this scene. Not a pass.`)
const best = A.filter(r => r.max < TOL).length >= B.filter(r => r.max < TOL).length ? A : B
const sgn = best === A ? '+1' : '-1'
o(`   ⇒ ONE global convention (${sgn}) carries the map — the sign is DERIVED, not fitted per cap.`)
o(`   legs truncated at an AUTHORED width change: ${best.filter(r => r.stopped).length}/${best.length}  (median stop ${q(best.filter(r => r.stopped).map(r => r.stopAt), .5)?.toFixed(2) ?? 'n/a'} m)`)
const fail = best.filter(r => r.max >= TOL).sort((a, b) => b.max - a.max)
o(`\n⛔ LEGS OFF THE AUTHORED WIDTH: ${fail.length}   — cause NOT established`)
o(`   ${'skelId'.padEnd(26)} ${'hwL'.padStart(6)} ${'hwR'.padStart(6)} ${'worst'.padStart(7)} ${'stop'.padStart(6)}  producer`)
for (const r of fail) o(`   ${r.id.padEnd(26)} ${r.hwL.toFixed(2).padStart(6)} ${r.hwR.toFixed(2).padStart(6)} ${r.max.toFixed(3).padStart(7)} ${(r.stopped ? r.stopAt.toFixed(1) : '-').padStart(6)}  ${r.prod}`)
o(`\n⛔ NOT MEASURED HERE, BY DESIGN: the cap (no authored value) and the tip/mouth node count.`)
o(`   ▶ node scratch/coupler-slit-universal.mjs   — 50/50 tips FACE=SLIT, gap 0.000 (collapsed, not joined)`)

// ⛔⛔ NOTHING MEASURED IS NOT A PASS, AND THIS EXIT IS THE POINT OF THE FIX.
// Before this, an empty sample CRASHED (`undefined.toFixed`). Simply not crashing
// would have been worse than the crash: the check would print its banner, measure
// nothing, and exit 0 — a scene with no scorable leg would read as green forever.
// That is the plausible-looking success Layer 0 names as the worst outcome, and
// putting one inside a detector is how a suite stops being evidence.
if (!A.length && !B.length) {
  o(`\n⛔ LOUD FAIL — 0 legs scored on this scene, so nothing here was measured.`)
  o(`   A check that measured nothing has not passed. Fix the input or the window`)
  o(`   (LEG=${LEG} m, STEP=${STEP} m); do not read this as a clean result.`)
  process.exit(1)
}
