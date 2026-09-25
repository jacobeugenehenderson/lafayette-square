/**
 * boulder-huron-input.mjs — SUSPECT THE INPUT, NOT THE EDGE CASES.
 * ▶ node scratch/boulder-huron-input.mjs
 *
 * ⭐ The boulder probe measured that 7 of huron's 14 shoreline arcs make the
 * revetment band fold through itself, and the first instinct was to write a new
 * construction (medial-axis offsetting, swept-solid booleans). ⛔ `SKELETON.md §0.1`
 * records a day lost to exactly that move — guards against a protopolygon built
 * from densified chains, where feeding it the SIMPLIFIED geometry moved every
 * failure at once with no new code.
 *
 * The tell was in the probe's own numbers: minimum turn radii of 0.6 and 0.8 m.
 * ⭐ A shoreline does not turn inside one armour stone. An OSM trace does. These
 * arcs have never been through the simplification every other line in this kit gets.
 *
 * ⛔ This script DECIDES NOTHING. It measures what simplification does to the fold
 * count, and what the tall stretches actually are, so the case for a new
 * construction is either dismissed or proved.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadHuronShore, profileArc, crestFn } from '../cartograph/_archive/boulder-harness-2026-09-24/huron.js'
import { RIPRAP_REPOSE_DEG, MIN_ARMOUR_D50_M } from '../cartograph/shore-armour.mjs'

const TAN = Math.tan(RIPRAP_REPOSE_DEG * Math.PI / 180)
const ROOT = path.resolve(import.meta.dirname, '..')
const local = (u) => path.join(ROOT, u.startsWith('/baked') ? 'public' + u : u.replace(/^\//, ''))
const fetcher = {
  json: async (u) => JSON.parse(fs.readFileSync(local(u), 'utf8')),
  bin: async (u) => { const b = fs.readFileSync(local(u)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) },
}

/** Douglas–Peucker. ⛔ Tolerance is not a taste setting here: it is the scale of the
 *  thing being built. A wiggle smaller than one armour stone cannot be represented
 *  by stone, so carrying it into the construction is carrying noise. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1, wi = -1
    const ax = pts[a].x, az = pts[a].z, bx = pts[b].x, bz = pts[b].z
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz
    for (let i = a + 1; i < b; i++) {
      const t = L2 ? Math.max(0, Math.min(1, ((pts[i].x - ax) * dx + (pts[i].z - az) * dz) / L2)) : 0
      const d = Math.hypot(pts[i].x - (ax + t * dx), pts[i].z - (az + t * dz))
      if (d > worst) { worst = d; wi = i }
    }
    if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

const minTurnRadius = (poly) => {
  let minR = Infinity
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[i - 1], b = poly[i], c = poly[i + 1]
    const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), C = Math.hypot(c.x - a.x, c.z - a.z)
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z))
    if (area2 < 1e-9 || A < 1e-6 || B < 1e-6) continue
    minR = Math.min(minR, (A * B * C) / (2 * area2))
  }
  return minR
}

const { arcs, elevAt, armourAt } = await loadHuronShore({ fetcher })
const live = arcs.filter(a => !a.refused && a.len > 20)

console.log(`\n② DOES SIMPLIFYING THE INPUT KILL THE FOLDS?`)
console.log(`   ${live.length} arcs that wetSideOf rules on and that are longer than 20 m.`)
console.log(`   tol = Douglas–Peucker tolerance in metres. band = widest crest/tan(${RIPRAP_REPOSE_DEG}°) on that arc.\n`)
console.log('   tol'.padEnd(8) + 'arcs folding'.padStart(14) + 'verts kept'.padStart(13) + 'length kept'.padStart(13) + '   worst arc (min radius vs band)')
for (const tol of [0, 0.5, 1, 2, 4, 8]) {
  let folds = 0, vIn = 0, vOut = 0, lIn = 0, lOut = 0, worst = null
  for (const arc of live) {
    const prof = profileArc(arc, elevAt, armourAt)
    let band = 0
    for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i]) band = Math.max(band, prof.crest[i] / TAN)
    const poly = arc.flip ? [...arc.poly].reverse() : arc.poly
    const simp = tol > 0 ? simplify(poly, tol) : poly
    let L = 0; for (let i = 1; i < simp.length; i++) L += Math.hypot(simp[i].x - simp[i - 1].x, simp[i].z - simp[i - 1].z)
    vIn += poly.length; vOut += simp.length; lIn += arc.len; lOut += L
    const R = minTurnRadius(simp)
    if (R < band) { folds++; if (!worst || (band - R) > (worst.band - worst.R)) worst = { id: arc.id, R, band } }
  }
  console.log(`   ${String(tol).padEnd(5)}` + `${folds} / ${live.length}`.padStart(14) +
    `${(100 * vOut / vIn).toFixed(0)}%`.padStart(13) + `${(100 * lOut / lIn).toFixed(1)}%`.padStart(13) +
    (worst ? `   #${worst.id}: ${worst.R.toFixed(1)} m vs ${worst.band.toFixed(1)} m` : '   —'))
}

console.log(`\n③ WHAT ARE THE TALL STRETCHES? (a revetment is a short face then FLAT;`)
console.log(`   a bluff keeps climbing. Sampled landward at 6 / 12 / 24 / 48 m.)\n`)
console.log('   arc  crest   +6m   +12m  +24m  +48m   verdict')
for (const arc of live) {
  const prof = profileArc(arc, elevAt, armourAt)
  const poly = arc.flip ? [...arc.poly].reverse() : arc.poly
  // the tallest armoured vertex on this arc
  let bi = -1, best = 0
  for (let i = 1; i < prof.crest.length - 1; i++) if (prof.armour[i] && prof.crest[i] > best) { best = prof.crest[i]; bi = i }
  if (bi < 0) continue
  const a = poly[bi - 1], b = poly[bi + 1], p = poly[bi]
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1
  const nx = dz / L, nz = -dx / L                  // waterward
  const at = (d) => elevAt(p.x - nx * d, p.z - nz * d)
  const h = [at(6), at(12), at(24), at(48)]
  const rise = h[3] - h[0]
  const verdict = rise > 2 ? '⛔ still climbing — BLUFF, not a revetment'
    : rise > 0.8 ? '⚠️ mixed' : 'flat behind — revetment-shaped'
  console.log(`   #${String(arc.id).padStart(2)}  ${best.toFixed(2).padStart(5)}  ` +
    h.map(v => v.toFixed(1).padStart(5)).join(' ') + `   ${verdict}`)
}

// ⭐ THE CONSEQUENCE OF THE TALL STRETCHES, MEASURED — ⛔ NOT APPLIED. If the
// armour predicate gained an UPPER bound the way it already has a lower one (below
// one course = a kerb, not a revetment), what would the fold count be? This is a
// measurement of what the open question is worth, not a cap. ⛔ Do not turn it into
// one: whether a 9 m face is dumped riprap at all is Jacob's to rule.
console.log('   IF vertices above the surveyed 3.7 m were not counted as revetment:')
for (const tol of [0, 1, 2, 4]) {
  let folds = 0
  for (const arc of live) {
    const prof = profileArc(arc, elevAt, armourAt)
    let band = 0
    for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i] && prof.crest[i] <= 3.7) band = Math.max(band, prof.crest[i] / TAN)
    const poly = arc.flip ? [...arc.poly].reverse() : arc.poly
    const simp = tol > 0 ? simplify(poly, tol) : poly
    if (minTurnRadius(simp) < band) folds++
  }
  console.log(`      tol ${String(tol).padEnd(3)} → ${folds} / ${live.length} arcs fold`)
}

const tall = []
for (const arc of live) {
  const prof = profileArc(arc, elevAt, armourAt)
  for (let i = 0; i < prof.crest.length; i++) if (prof.armour[i] && prof.crest[i] > 3.7) tall.push({ id: arc.id, h: prof.crest[i] })
}
const armouredTotal = live.reduce((s, a) => s + profileArc(a, elevAt, armourAt).armour.reduce((x, y) => x + y, 0), 0)
console.log(`\n   ⭐ ${tall.length} of ${armouredTotal} armoured vertices exceed the 3.7 m the lidar survey found`)
console.log(`      (${(100 * tall.length / armouredTotal).toFixed(1)}%), on arcs: ${[...new Set(tall.map(t => '#' + t.id))].join(' ')}\n`)
