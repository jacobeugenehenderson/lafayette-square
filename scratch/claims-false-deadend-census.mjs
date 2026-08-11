#!/usr/bin/env node
/**
 * "IS THIS DEGREE-1 TIP A ROAD END, OR A FRAGMENT SEAM?"
 *
 * A0 asks the polygon layer to close the shape at a dead end. SKELETON §5b-bis
 * says some of those tips are not dead ends at all: an unwelded same-name
 * fragment leaves a degree-1 tip with cap:'round', so the map faithfully draws
 * a cul-de-sac bulb where the street continues. That defect arrives from the
 * SKELETON — two stages upstream of where A0 works — and nothing in prebake,
 * Survey or Section can touch it.
 *
 * ⭐ THIS IS THE FILTER A0's OWN ENTRY ASKS FOR AND NOBODY HAD RUN:
 *   intersect the degree-1 tip set with the same-name-fragment set.
 *   A tip in both is a FALSE dead end. Until this number exists, A0's size is
 *   unknown.
 *
 * ⛔ Reads the SKELETON, never map.json / ribbons.json (A01: the committed
 *    map.json is stale and does not correspond to any run of current code).
 * ⛔ Reads each tip's own caps.<which>.degree from the frame. It does NOT
 *    recompute degree from endpoint coincidence — that undercounts (it reads a
 *    live 3-way T as degree 1) and it is chain-world reasoning besides.
 * ⛔ No fallback: a scene without a skeleton, or a chain without caps, is
 *    reported LOUD as its own class and never folded into a count.
 * ⛔ No LS knowledge. No street names in this source. Runs on every scene that
 *    has a skeleton; the operator reads the per-scene table.
 *
 * Read-only. Writes nothing.
 *
 * Usage: node scratch/claims-false-deadend-census.mjs [--scene=<name>] [--verbose]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'cartograph/data')

const argScene = process.argv.find(a => a.startsWith('--scene='))?.split('=')[1]
const VERBOSE = process.argv.includes('--verbose')

// The two thresholds are REPORTING knobs, not a gate. Every tip is printed with
// its own gap and turn, and the sensitivity table below re-counts at several
// values so the headline is never hostage to one constant.
const GAP_M = 60      // a fragmentation hole; a real cul-de-sac has no same-name partner at all
const TURN_DEG = 45   // the seam continues the street's own heading

const norm = n => (n || '').trim().toLowerCase()
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z })
const ang = (u, v) => {
  const lu = Math.hypot(u.x, u.z), lv = Math.hypot(v.x, v.z)
  if (lu < 1e-9 || lv < 1e-9) return NaN
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.z * v.z) / (lu * lv)))) * 180 / Math.PI
}
// the direction the chain is TRAVELLING as it arrives at this end
const outward = (pts, which) =>
  which === 'start' ? sub(pts[0], pts[1]) : sub(pts[pts.length - 1], pts[pts.length - 2])

const scenes = (argScene ? [argScene] : readdirSync(DATA))
  .filter(s => existsSync(resolve(DATA, s, 'clean/skeleton.json')))

if (!scenes.length) {
  console.error('⛔ no scene has clean/skeleton.json — nothing to measure. Refusing to print a zero.')
  process.exit(1)
}

console.log('FALSE DEAD-END CENSUS — degree-1 tips ∩ same-name fragments')
console.log(`gap ≤ ${GAP_M} m · turn ≤ ${TURN_DEG}°   (skeleton.json; degree read from caps, never recomputed)\n`)

const totals = { tips: 0, false: 0, real: 0, loud: 0 }
const sens = {}

for (const scene of scenes) {
  const sk = JSON.parse(readFileSync(resolve(DATA, scene, 'clean/skeleton.json'), 'utf8'))
  const streets = (sk.streets || []).filter(s => s?.points?.length >= 2)

  const byName = new Map()
  for (const s of streets) {
    const n = norm(s.name)
    if (!n) continue
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(s)
  }
  const fragmentedNames = [...byName].filter(([, a]) => a.length > 1)

  const rows = []
  const loud = []

  for (const s of streets) {
    for (const which of ['start', 'end']) {
      const cap = s.caps?.[which]
      if (!cap || typeof cap.degree !== 'number') {
        loud.push(`${s.id} ${which}: NO caps.degree in the frame — unclassifiable`)
        continue
      }
      if (cap.degree !== 1) continue

      const n = norm(s.name)
      const tip = which === 'start' ? s.points[0] : s.points[s.points.length - 1]
      const out = outward(s.points, which)

      // nearest endpoint of a DIFFERENT chain carrying the SAME name
      let best = null
      for (const o of (byName.get(n) || [])) {
        if (o === s) continue
        for (const ow of ['start', 'end']) {
          const op = ow === 'start' ? o.points[0] : o.points[o.points.length - 1]
          const d = dist(tip, op)
          // the seam continues this street: our outward heading vs the bearing
          // to the partner, and vs the partner's own outward heading reversed
          const bearing = sub(op, tip)
          const turn = Math.max(ang(out, bearing), ang(out, { x: -outward(o.points, ow).x, z: -outward(o.points, ow).z }))
          if (!best || d < best.d) best = { d, turn, id: o.id, which: ow, degree: o.caps?.[ow]?.degree ?? '?' }
        }
      }

      const verdict = !n ? 'UNNAMED'
        : !best ? 'REAL'
        : (best.d <= GAP_M && best.turn <= TURN_DEG) ? 'FALSE' : 'REAL'
      rows.push({ id: s.id, which, name: s.name, cap: cap.cap, best, verdict })
    }
  }

  const f = rows.filter(r => r.verdict === 'FALSE')
  const r = rows.filter(r => r.verdict === 'REAL')
  const u = rows.filter(r => r.verdict === 'UNNAMED')

  console.log(`━━ ${scene}`)
  console.log(`   chains ${streets.length} · named streets fragmented into >1 chain: ${fragmentedNames.length}/${byName.size}`)
  console.log(`   degree-1 tips: ${rows.length}`)
  console.log(`   ⛔ FALSE dead end (same-name fragment seam) : ${f.length}   ← A0 cannot fix these; SKELETON §5b-bis owns them`)
  console.log(`   ✅ REAL road end (no same-name partner)      : ${r.length}`)
  if (u.length) console.log(`   ⚠️  UNNAMED chain, cannot be name-tested   : ${u.length}`)
  if (loud.length) {
    console.log(`   ⛔ UNCLASSIFIABLE — frame carries no degree : ${loud.length}`)
    for (const l of loud) console.log(`        ${l}`)
  }
  for (const row of f) {
    console.log(`      ⛔ ${row.id.padEnd(28)} ${row.which.padEnd(5)} cap=${String(row.cap).padEnd(6)}`
      + ` → ${row.best.id} ${row.best.which} (deg ${row.best.degree})  gap ${row.best.d.toFixed(1)} m  turn ${row.best.turn.toFixed(0)}°`)
  }
  if (VERBOSE) for (const row of r) {
    console.log(`      ✅ ${row.id.padEnd(28)} ${row.which.padEnd(5)} cap=${String(row.cap).padEnd(6)}`
      + (row.best ? `  nearest same-name ${row.best.d.toFixed(1)} m / turn ${row.best.turn.toFixed(0)}°` : '  no same-name chain'))
  }
  console.log()

  totals.tips += rows.length; totals.false += f.length; totals.real += r.length; totals.loud += loud.length

  // sensitivity — so the headline is not one constant's opinion
  for (const g of [20, 40, 60, 100]) {
    const k = `gap≤${g}m`
    sens[k] = (sens[k] || 0) + rows.filter(x => x.best && x.best.d <= g && x.best.turn <= TURN_DEG).length
  }
}

console.log(`═══ TOTAL across ${scenes.length} scene(s): ${totals.tips} degree-1 tips · ${totals.false} FALSE · ${totals.real} REAL`
  + (totals.loud ? ` · ${totals.loud} UNCLASSIFIABLE` : ''))
console.log('    sensitivity (turn ≤ ' + TURN_DEG + '°):', Object.entries(sens).map(([k, v]) => `${k} → ${v}`).join(' · '))
console.log(`
⛔ A FALSE tip is not a polygon failure. The frame says the street ends; the
   polygon is a faithful shadow of it. Welding the fragment (SKELETON §5b-bis)
   removes the tip, the cap, the bulb and the slit in one move, upstream.
   → SKELETON §5b-bis · ROADMAP A0 · OSM-FORENSICS §④`)
