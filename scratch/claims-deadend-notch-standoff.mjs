// THE CHECK: at every frozen dead-end cap, the block (iA) must stand off the
// spur centerline by EXACTLY the half-width the producer was given on that side.
//
// ⭐ Why this generalises to a town nobody has looked at: the expected value is
// read out of the producer's OWN per-run `measure` in shape.json — never a
// constant, never a human's knowledge of the street. An asymmetric spur is the
// operator's authoring and must PASS; a side built at a width nobody authored is
// the defect. (Layer 0 q3: the only honest test is a DISTANCE one, run WITH
// authoring loaded. shape.json IS the authored bake.)
//
//   node scratch/claims-deadend-notch-standoff.mjs [scene] [skelId]
//
// Reports per cap: the ray-marched half-width per side vs the authored set.
// Writes nothing.
import fs from 'fs'
import crypto from 'crypto'

const scene = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'lafayette-square'
const ONLY = process.argv[3] || null
const SHAPE = `public/baked/${scene}/shape.json`
const RIBBONS = scene === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${scene}/clean/ribbons.json`
const o = console.log
if (!fs.existsSync(SHAPE)) { o(`no ${SHAPE}`); process.exit(1) }
const RAW = fs.readFileSync(SHAPE)
const sh = JSON.parse(RAW)
const rb = JSON.parse(fs.readFileSync(RIBBONS, 'utf8'))
o(`scene ${scene}   shape.json sha256 ${crypto.createHash('sha256').update(RAW).digest('hex').slice(0, 10)}`)

const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
const K = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)
const stBySkel = new Map(rb.streets.map(s => [s.skelId || s.name, s]))
const deg = new Map()
for (const s of rb.streets) {
  if (!(s.points?.length >= 2) || s.gradeSeparated) continue
  for (let i = 0; i < s.points.length; i++) deg.set(K(s.points[i]), (deg.get(K(s.points[i])) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
}
const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
const inIA = (p, rings) => { let c = 0; for (const r of rings) if (inRing(p, r)) c++; return c % 2 === 1 }
const STEP = 0.02, MAXOUT = 40, TOL = 0.10

// The authored half-widths the producer used AT A STATION on the spur, per side,
// taken from the tile's own runs (per-fe resolved: blockCustoms over the chain
// measure). ⭐ Station-local, never spur-wide: a single spur may change width
// several times across its span — that is what the authoring tools are FOR
// (SURVEY §4) — so a spur-wide median would report the operator's edit as a
// defect on any street long enough to have been worked on.
function runsCovering(tile, skelId, q) {
  const out = []
  for (const r of (tile.runs || [])) {
    if (r.skelId !== skelId) continue
    let best = Infinity
    for (let i = 0; i < r.poly.length - 1; i++) {
      const a = r.poly[i], b = r.poly[i + 1]
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
      let u = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / L2
      u = Math.max(0, Math.min(1, u))
      best = Math.min(best, Math.hypot(q[0] - (a[0] + ex * u), q[1] - (a[1] + ez * u)))
    }
    const hw = r.measure?.[r.side]?.pavementHW
    if (best < 0.5 && Number.isFinite(hw)) out.push({ side: r.side, hw: +hw })
  }
  return out
}

const rows = []
sh.tiles.forEach((t, ti) => {
  const rings = t.iA || []; if (!rings.length) return
  for (const c of (rb.tiles[ti]?.caps || [])) {
    if (ONLY && c.skelId !== ONLY) continue
    const st = stBySkel.get(c.skelId); if (!st) continue
    const seq = c.capEnd === 'end' ? [...st.points].reverse() : st.points
    const cum = [0]; for (let i = 1; i < seq.length; i++) cum[i] = cum[i - 1] + d(seq[i - 1], seq[i])
    let spurLen = cum[cum.length - 1]
    for (let i = 1; i < seq.length; i++) if ((deg.get(K(seq[i])) || 0) >= 3) { spurLen = cum[i]; break }
    const at = (s) => {
      for (let i = 1; i < seq.length; i++) if (cum[i] >= s || i === seq.length - 1) {
        const a = seq[i - 1], b = seq[i], L = Math.max(1e-9, cum[i] - cum[i - 1]), u = (s - cum[i - 1]) / L
        return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
      }
      return null
    }
    // Sample ONLY the stretch the tip-adjacent runs actually own. A spur may
    // change width across its span (legal authoring), so the check speaks for
    // the leg that meets the cap and declines to speak for the rest.
    const station = (q) => {   // project a point onto the chain → station from the tip
      let best = { d: Infinity, s: 0 }
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1], b = seq[i], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
        let u = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / L2; u = Math.max(0, Math.min(1, u))
        const dd = Math.hypot(q[0] - (a[0] + ex * u), q[1] - (a[1] + ez * u))
        if (dd < best.d) best = { d: dd, s: cum[i - 1] + u * Math.sqrt(L2) }
      }
      return best.s
    }
    const tipRuns = (t.runs || []).filter(r => r.skelId === c.skelId && r.poly.some(p => d(p, seq[0]) < 0.05))
    const widthsBySide = { left: new Set(), right: new Set() }
    let cover = 0
    for (const r of tipRuns) {
      const hw = r.measure?.[r.side]?.pavementHW
      if (Number.isFinite(hw)) widthsBySide[r.side].add(+hw)
      for (const p of r.poly) cover = Math.max(cover, station(p))
    }
    const exps = [...widthsBySide.left, ...widthsBySide.right]
    const ambiguous = widthsBySide.left.size > 1 || widthsBySide.right.size > 1
    if (!exps.length) { rows.push({ ti, c, spurLen, skip: 'no run of this chain touches the tip' }); continue }
    if (ambiguous) { rows.push({ ti, c, spurLen, skip: `the cap leg carries >1 authored width (${exps.map(v => v.toFixed(2)).join(', ')}) — legal authoring, not judged` }); continue }
    const hw0 = Math.max(...exps)
    const lo = hw0 + 3, hi = Math.min(spurLen, cover) - hw0 - 3
    if (!(hi > lo)) { rows.push({ ti, c, spurLen, skip: 'cap leg shorter than 2·hw+6' }); continue }
    const EXP = exps.length === 1 ? [exps[0], exps[0]] : exps.slice(0, 2)
    let nOK = 0, nBad = 0, nNoRun = 0, nNoHit = 0, nFar = 0, worst = 0, worstAt = null
    const seen = new Set()
    for (let s2 = lo; s2 <= hi; s2 += 1) {
      const q = at(s2); if (!q) continue
      const nx = -q.t[1], nz = q.t[0]
      const got = []
      for (const sgn of [1, -1]) {
        let hit = null
        for (let r = STEP; r < MAXOUT; r += STEP) if (inIA([q.p[0] + nx * sgn * r, q.p[1] + nz * sgn * r], rings)) { hit = r; break }
        if (hit != null) got.push(hit)
      }
      if (got.length < 2) { nNoHit++; continue }
      // ⚠️ A march that ran far past the authored width did NOT find this
      // street's own block edge — it crossed a median, an apron or an open
      // junction and landed on something else. Counted as UNRESOLVED, never as
      // clean and never as a defect: this check does not know what it hit.
      if (got.some(v => v > 3 * Math.max(...EXP) + 1)) { nFar++; continue }
      const exp = EXP
      const p1 = Math.max(Math.abs(got[0] - exp[0]), Math.abs(got[1] - exp[1]))
      const p2 = Math.max(Math.abs(got[0] - exp[1]), Math.abs(got[1] - exp[0]))
      const err = Math.max(0, Math.min(p1, p2) - STEP)
      if (err > TOL) { nBad++; if (err > worst) { worst = err; worstAt = { s: s2, got: got.map(v => +v.toFixed(2)), exp: exp.map(v => +v.toFixed(2)) } } } else nOK++
    }
    rows.push({ ti, c, spurLen, cover, nOK, nBad, nNoRun, nNoHit, nFar, worst, worstAt, widths: EXP.map(v => v.toFixed(2)) })
  }
})

o('')
o('tile skelId                       end   spur   stations ok/bad   worst station error         authored HW (cap leg)')
const fail = []
for (const r of rows.sort((x, y) => (y.worst ?? -1) - (x.worst ?? -1))) {
  if (r.skip) { o(`${String(r.ti).padStart(4)} ${r.c.skelId.padEnd(28)} ${r.c.capEnd.padEnd(5)} ${r.spurLen.toFixed(0).padStart(5)}   — not measurable: ${r.skip}`); continue }
  const bad = r.nBad > 0
  if (bad) fail.push(r)
  o(`${String(r.ti).padStart(4)} ${r.c.skelId.padEnd(28)} ${r.c.capEnd.padEnd(5)} ${r.spurLen.toFixed(0).padStart(5)}   ` +
    `${String(r.nOK).padStart(4)}/${String(r.nBad).padEnd(4)} ` +
    `${(r.worstAt ? `${r.worst.toFixed(2)} m at s=${r.worstAt.s}  got ${r.worstAt.got.join('/')} want ${r.worstAt.exp.join('/')}` : 'clean').padEnd(44)}` +
    `${r.widths.join(' ')}${bad ? '  ⛔' : ''}` +
    (r.nNoHit || r.nFar ? `   [unresolved: ${r.nNoHit} no iA on one side, ${r.nFar} ran past 3x the authored width]` : ''))
}
const measurable = rows.filter(r => !r.skip)
o(`\ncaps ${rows.length} · measurable ${measurable.length} · caps with ANY station off by > ${TOL} m: ${fail.length}`)
process.exitCode = fail.length ? 1 : 0
