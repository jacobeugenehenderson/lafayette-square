#!/usr/bin/env node
// ⛔⛔ IS ANY CHAIN LYING ON TOP OF ANOTHER CHAIN? — the duplicate-centerline census.
//
// WHY. Jacob's eye, 2026-09-06, on Survey: two navy centerlines running near-parallel with a
// sliver between them, converging at a junction — "whatever it is it's not good." The navy is
// the SKELETON chains (`SurveyorOverlay.jsx:484`), so a doubled navy line is a doubled chain,
// and a doubled chain manufactures blocks and corners that do not exist: removing the one
// offender below took ① from 318 holes / 1593 crossings to 275 / 1417.
//
// ⭐ THE CAUSE THAT DAY, AND IT IS A CLASS. OSM tags a planned alignment `highway=proposed`
// (also `construction`/`planned`/`abandoned`/`razed`) and draws it ON the real road it will
// replace. Nothing filtered them, and `skeleton.js`'s `seedSection` maps any unknown class to
// 'residential', so a busway with `start_date=2031` was poured as a residential street on top
// of South Jefferson Avenue for 852 m. ⛔ That is a SILENT FALLBACK inside the SSoT — Layer 0
// q2 — and the silence is why it survived to the operator's eye instead of the console.
// The intake filter now drops these LOUDLY (`skeleton.js` main()); this check is the gate.
//
// ⭐ WHAT IS NOT A DEFECT: a divided road's two carriageways legitimately run parallel. They
// are reported SEPARATELY, by `pairId`, and never counted as shadows — a difference between
// blocks is the product (`CLAUDE.md` Layer 0 q3).
// ⛔ Measured on the promoted artifact the operator's map is made of, not on a live rebuild.
// ▶ node checks/claims-no-shadowed-chains.mjs [scene ...]
import fs from 'fs'

const ribbonsPath = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`
const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun', 'altadena')
const TOL = 6, FRAC = 0.8, STEP = 5

const d2seg = (p, a, b) => { const ex = b[0]-a[0], ez = b[1]-a[1], L2 = ex*ex+ez*ez || 1
  let t = ((p[0]-a[0])*ex + (p[1]-a[1])*ez)/L2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0]-(a[0]+ex*t), p[1]-(a[1]+ez*t)) }
const polyLen = (c) => { let L = 0; for (let i = 1; i < c.length; i++) L += Math.hypot(c[i][0]-c[i-1][0], c[i][1]-c[i-1][1]); return L }

let failed = false
for (const scene of scenes) {
  const p = ribbonsPath(scene)
  if (!fs.existsSync(p)) { console.log(`⛔ ${scene}: no ribbons at ${p} — SKIPPED LOUDLY, NOT checked`); failed = true; continue }
  const S = (JSON.parse(fs.readFileSync(p, 'utf8')).streets || []).filter(s => (s.points || []).length >= 2)
  if (!S.length) { console.log(`⛔ ${scene}: no chains — NOT checked`); failed = true; continue }

  // one grid over every chain's segments, so this is not O(n²) on a big town
  const CELL = 25, grid = new Map(), gk = (a, b) => a + ',' + b
  S.forEach((s, si) => { for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i-1], b = s.points[i]
    const x0 = Math.min(a[0],b[0])-TOL, x1 = Math.max(a[0],b[0])+TOL, z0 = Math.min(a[1],b[1])-TOL, z1 = Math.max(a[1],b[1])+TOL
    for (let cx = Math.floor(x0/CELL); cx <= Math.floor(x1/CELL); cx++)
      for (let cz = Math.floor(z0/CELL); cz <= Math.floor(z1/CELL); cz++) {
        const k = gk(cx,cz); let e = grid.get(k); if (!e) grid.set(k, e = []); e.push([a,b,si])
      } } })

  const rows = []
  S.forEach((s, si) => {
    const hits = new Map(); let tot = 0
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i-1], b = s.points[i], L = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.ceil(L/STEP))
      for (let k = 0; k < n; k++) {
        const t = k/n, q = [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; tot++
        const seen = new Set()
        const cx = Math.floor(q[0]/CELL), cz = Math.floor(q[1]/CELL)
        for (let ax = cx-1; ax <= cx+1; ax++) for (let az = cz-1; az <= cz+1; az++)
          for (const [u, v, sj] of (grid.get(gk(ax,az)) || [])) {
            if (sj === si || seen.has(sj)) continue
            if (d2seg(q, u, v) < TOL) { seen.add(sj); hits.set(sj, (hits.get(sj) || 0) + 1) }
          }
      }
    }
    if (!tot) return
    for (const [sj, n] of hits) {
      const f = n/tot; if (f < FRAC) continue
      // ⭐ a divided road's own pair is the PRODUCT, not a shadow
      const paired = s.pairId != null && s.pairId === S[sj].pairId
      rows.push({ name: s.name || '(unnamed)', L: polyLen(s.points), other: S[sj].name || '(unnamed)', f, paired })
    }
  })

  const shadows = rows.filter(r => !r.paired), pairs = rows.filter(r => r.paired)
  console.log(`\n${'='.repeat(72)}\n${scene} — ${S.length} chain(s)`)
  console.log(`   divided-carriageway pairs (EXPECTED, the product): ${pairs.length}`)
  if (!shadows.length) { console.log(`   ✅ no chain is ≥${FRAC*100}% shadowed by an unrelated chain within ${TOL} m.`); continue }
  console.log(`   ⛔ ${shadows.length} chain(s) ≥${FRAC*100}% shadowed by an UNRELATED chain within ${TOL} m:`)
  for (const r of shadows.sort((a,b) => b.L - a.L).slice(0, 20))
    console.log(`      ${r.name.padEnd(30)} ${r.L.toFixed(0).padStart(6)} m  ${(r.f*100).toFixed(0)}% inside  ${r.other}`)
  if (shadows.length > 20) console.log(`      …and ${shadows.length - 20} more`)
  console.log(`   ⛔ A doubled centerline manufactures blocks and corners that do not exist. Cause is NOT established by this check — read the offender's OSM tags.`)
  failed = true
}
console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'} — re-run this; do not quote its digits.`)
process.exit(failed ? 1 : 0)
