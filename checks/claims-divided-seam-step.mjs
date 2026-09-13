#!/usr/bin/env node
/**
 * DOES THE DIVIDED↔UNDIVIDED SEAM STEP SURVIVE INTO THE FROZEN ARTIFACT?
 *
 * Jacob, 2026-08-11: "The divided carriageways are in fact extensions of the two
 * way lanes; so the sidewalk/treelawn is logically continuous too." — and the
 * screenshot of Russell Boulevard, where the walk and treelawn visibly STEP at
 * the transition.
 *
 * `SKELETON §5d` already rules it: "the outer curb runs straight through the
 * transition; the median opens inward. A carriageway's outer edge must never
 * inherit the median-opening divergence."
 *
 * ⭐ WHAT THIS SEPARATES, AND WHY IT MATTERS. A step measured in `ribbons.json`'s
 *   seeded `measure` is a DATUM fact, upstream of any stroke. A step measured in
 *   the FROZEN artifact's per-fe `run.measure` is what the curb was actually
 *   offset at, in the authored state. Every fix direction depends on which, and
 *   the canon has three killed patches aimed at the wrong layer (§5e's corner
 *   patch, the prevailing-direction brief, the frame straighten).
 *
 * ⛔ RULE 1 — this reads the FROZEN artifact (authored state) and flags any
 *   corridor carrying an authored `pavementHW`. A prior pass measured Park
 *   Avenue's seeded widths without authoring and reported the operator's own
 *   decisions as a defect, twice. A corridor marked AUTHORED is NOT evidence.
 *
 * ⛔ RULE 2 — a corridor whose seam cannot be located in the artifact is reported
 *   as UNLOCATED, its own class, never folded into "no step found".
 *
 * The seam: two runs, on ONE tile, whose polys share an endpoint, where one run's
 * skelId is a carriageway and the other is the spine `phase.spineAtStart/End`
 * names. Reads the polygon (tile runs), not the chain graph — the classification
 * of which skelId is a carriageway comes from the frozen frame fact `phase`.
 *
 * Usage: node scratch/claims-divided-seam-step.mjs [--scene <name>]
 * → SKELETON §5d/§5e/§5h · SECTION §7 · CLAUDE.md Layer 0 q3 · ROADMAP A06
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'

const shapeP = path.join(ROOT, 'public/baked', scene, 'shape.json')
const ribP = path.join(ROOT, 'src/data/ribbons.json')          // LS's frame (the promoted one)
const designP = path.join(ROOT, 'public/looks', scene, 'design.json')
for (const p of [shapeP, ribP]) {
  if (!fs.existsSync(p)) { console.error(`⛔ missing input: ${p} — NOT MEASURED`); process.exit(2) }
}
const tiles = (j => Array.isArray(j) ? j : j.tiles)(JSON.parse(fs.readFileSync(shapeP, 'utf8')))
const streets = JSON.parse(fs.readFileSync(ribP, 'utf8')).streets || []
const bc = fs.existsSync(designP) ? (JSON.parse(fs.readFileSync(designP, 'utf8')).blockCustoms || {}) : {}

// ── the carriageway↔spine links, from the frozen frame fact ──
const links = new Map()   // "a||b" (sorted) → { cw, spine, corridor }
for (const s of streets) {
  if (!/^carriageway/.test(s.phase?.role || '')) continue
  for (const f of ['spineAtStart', 'spineAtEnd']) {
    const sp = s.phase?.[f]; if (!sp) continue
    const k = [s.skelId, sp].sort().join('||')
    links.set(k, { cw: s.skelId, spine: sp, corridor: s.phase.corridorName || s.skelId })
  }
}
if (!links.size) { console.error('⛔ no carriageway→spine links in the frame — NOT MEASURED'); process.exit(2) }

// authored-pavementHW corridors (Rule 1)
const authored = new Set()
for (const k in bc) for (const side in bc[k]) for (const so in bc[k][side]) {
  if (bc[k][side][so]?.pavementHW != null) authored.add(k)
}

const hw = (m, side) => { const v = m?.[side]?.pavementHW; return Number.isFinite(v) ? Math.max(0, v) : 0 }
const band = (m, side) => {
  const x = m?.[side]; if (!x) return 0
  const a = hw(m, side); if (a <= 0) return 0
  return a + Math.max(0, x.treelawn || 0) + Math.max(0, x.sidewalk || 0)
}
const K = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`

// ── walk every tile's runs, find the seams ──
const seams = []
const seen = new Set()
for (const [ti, st] of tiles.entries()) {
  const runs = st.runs || []
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const A = runs[i], B = runs[j]
      if (!A.skelId || !B.skelId || A.skelId === B.skelId) continue
      const link = links.get([A.skelId, B.skelId].sort().join('||'))
      if (!link) continue
      // do these two arcs actually MEET on this tile's ring?
      const ea = [A.poly[0], A.poly[A.poly.length - 1]], eb = [B.poly[0], B.poly[B.poly.length - 1]]
      let meet = null
      for (const p of ea) for (const q of eb) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5) meet = p
      if (!meet) continue
      const id = `${link.cw}|${link.spine}|${K(meet)}`
      if (seen.has(id)) continue
      seen.add(id)
      const cwRun = A.skelId === link.cw ? A : B
      const spRun = A.skelId === link.cw ? B : A
      seams.push({
        ti, corridor: link.corridor, cw: link.cw, spine: link.spine, at: meet,
        dHW: +(hw(cwRun.measure, cwRun.side) - hw(spRun.measure, spRun.side)).toFixed(3),
        dBand: +(band(cwRun.measure, cwRun.side) - band(spRun.measure, spRun.side)).toFixed(3),
        cwHW: +hw(cwRun.measure, cwRun.side).toFixed(2), spHW: +hw(spRun.measure, spRun.side).toFixed(2),
        authored: authored.has(link.cw) || authored.has(link.spine),
      })
    }
  }
}

// ── report ──
console.log(`DIVIDED↔UNDIVIDED SEAM — does the step survive into the FROZEN artifact?`)
console.log(`scene ${scene} · ${tiles.length} tiles · ${links.size} carriageway→spine links in the frame`)
console.log(`Read from the frozen per-fe run.measure (the authored state the curb was offset at).\n`)

const located = new Set(seams.map(s => `${s.cw}||${s.spine}`))
const unlocated = [...links.values()].filter(l => !located.has(`${l.cw}||${l.spine}`) && !located.has(`${l.spine}||${l.cw}`))

if (!seams.length) {
  console.log(`⛔ 0 seams located on any tile ring — NOT MEASURED, not clean.`)
} else {
  console.log(`corridor / carriageway`.padEnd(30), 'spine'.padEnd(24), 'cwHW  spHW   ΔHW   Δband')
  for (const s of seams.sort((a, b) => Math.abs(b.dBand) - Math.abs(a.dBand))) {
    const flat = Math.abs(s.dHW) < 0.01 && Math.abs(s.dBand) < 0.01
    console.log(
      `${flat ? '  ' : '⛔'} ${s.cw}${s.authored ? ' *AUTHORED*' : ''}`.padEnd(30),
      String(s.spine).padEnd(24),
      String(s.cwHW).padStart(5), String(s.spHW).padStart(5),
      String(s.dHW).padStart(7), String(s.dBand).padStart(7))
  }
  const stepped = seams.filter(s => Math.abs(s.dHW) >= 0.01 || Math.abs(s.dBand) >= 0.01)
  const clean = seams.filter(s => !(Math.abs(s.dHW) >= 0.01 || Math.abs(s.dBand) >= 0.01))
  const evid = stepped.filter(s => !s.authored)
  console.log(`\n   seams located ${seams.length} · STEPPED ${stepped.length} · flat ${clean.length}`)
  console.log(`   of the stepped, UNAUTHORED (usable as evidence): ${evid.length}`)
  if (stepped.length !== evid.length) {
    console.log(`   ⚠️  ${stepped.length - evid.length} sit on a corridor carrying an authored pavementHW — NOT evidence (Layer 0 q3).`)
  }
}
if (unlocated.length) {
  console.log(`\n⛔ UNLOCATED — ${unlocated.length} carriageway→spine link(s) whose seam is not two meeting runs on one tile:`)
  for (const l of unlocated) console.log(`     ${l.cw}  ↔  ${l.spine}`)
  console.log(`   Its own class. These are NOT "no step found" — they are not measured.`)
}
// ── WORLD-SPACE: does the OUTER CURB LINE actually step? ────────────────────
// The datum numbers above are expressed against DIFFERENTLY-PLACED chains (the
// carriageway's sits at the median edge, the spine's at road centre), so a
// difference in the numbers does NOT prove a difference in the curb. This is the
// test that does: fit a line to the frozen `iA` on the SPINE side of the seam,
// then measure how far the CARRIAGEWAY side's `iA` sits off that line.
// `SKELETON §5d` — "the outer curb runs straight through the transition" — made
// a measurement. NOISE = the spine side's own residual against its own fit; a
// step is only real when it clears the noise floor.
const segDist = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1]
  const L2 = vx * vx + vy * vy
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2)) : 0
  return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t))
}
const polyDist = (p, poly) => { let m = Infinity; for (let i = 0; i < poly.length - 1; i++) { const d = segDist(p, poly[i], poly[i + 1]); if (d < m) m = d } return m }
const fitLine = (pts) => {              // PCA: centroid + principal direction
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { c: [cx, cy], n: [-Math.sin(th), Math.cos(th)] }   // unit normal
}
const perp = (p, L) => Math.abs((p[0] - L.c[0]) * L.n[0] + (p[1] - L.c[1]) * L.n[1])

const R_IN = 2, R_OUT = 14, MIN_PTS = 4
console.log(`\n── WORLD SPACE · does the outer curb LINE step? ──`)
console.log(`   fit the spine side's frozen iA in a ${R_IN}–${R_OUT} m annulus, measure the carriageway side against it\n`)
console.log('carriageway'.padEnd(28), 'spine'.padEnd(24), ' cwPts spPts   NOISE   STEPmean  STEPmax')
let realSteps = 0, flatCurbs = 0, unmeas = 0
for (const s of seams.sort((a, b) => Math.abs(b.dHW) - Math.abs(a.dHW))) {
  const st = tiles[s.ti]
  const runs = st.runs || []
  const cwRun = runs.find(r => r.skelId === s.cw), spRun = runs.find(r => r.skelId === s.spine)
  // ⚠️ RESAMPLE, don't use raw vertices. `iA` is a sparse polyline — a long
  // straight curb run carries almost no vertices, so a raw-vertex window
  // returned 0–4 points at every seam and the whole test read UNMEASURABLE.
  // Sample every 0.5 m ALONG the ring so a straight stretch is represented.
  const pts = []
  for (const ring of (Array.isArray(st.iA) ? st.iA : [])) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n = Math.max(1, Math.ceil(L / 0.5))
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
    }
  }
  const A = [], B = []
  if (cwRun && spRun) for (const p of pts) {
    const d = Math.hypot(p[0] - s.at[0], p[1] - s.at[1])
    if (d < R_IN || d > R_OUT) continue
    ;(polyDist(p, cwRun.poly) < polyDist(p, spRun.poly) ? A : B).push(p)
  }
  if (A.length < MIN_PTS || B.length < MIN_PTS) {
    unmeas++
    console.log(`?? ${s.cw}`.padEnd(28), String(s.spine).padEnd(24),
      String(A.length).padStart(6), String(B.length).padStart(5), '   UNMEASURABLE (too few iA points either side)')
    continue
  }
  const L = fitLine(B)
  const noise = B.reduce((m, p) => Math.max(m, perp(p, L)), 0)
  const ds = A.map(p => perp(p, L))
  const mean = ds.reduce((x, y) => x + y, 0) / ds.length, max = Math.max(...ds)
  const real = mean > noise + 0.25
  real ? realSteps++ : flatCurbs++
  console.log(`${real ? '⛔' : '  '} ${s.cw}`.padEnd(28), String(s.spine).padEnd(24),
    String(A.length).padStart(6), String(B.length).padStart(5),
    noise.toFixed(2).padStart(8), mean.toFixed(2).padStart(9), max.toFixed(2).padStart(9))
}
console.log(`\n   curb STEPS in world space: ${realSteps} · curb runs THROUGH: ${flatCurbs} · UNMEASURABLE: ${unmeas}`)
console.log(`   (a step counts only when the carriageway side's mean offset clears the spine side's own`)
console.log(`    residual by > 0.25 m — so curvature in the spine's curb cannot manufacture a finding)`)

console.log(`\n⭐ A step in run.measure is the DATUM stepping — the curb was offset at two different
   half-widths across a seam the frame says is one road's continuation. A flat seam here with a
   visible step on the eye would mean the datum is fine and the STROKE steps — a different layer,
   and the one the canon has three killed patches in (SKELETON §5e/§5h).`)
