#!/usr/bin/env node
// Classifier step 1: what moved in the SEED when it started reading the class's section.
// Compares two skeletons poured by the same code before/after (Tally, 2026-10-20).
// ▶ node scratch/style-guide/classifier-step1-seed-diff.mjs <before.json> <after.json>
import { readFileSync } from 'node:fs'
const [A, B] = process.argv.slice(2).map(p => JSON.parse(readFileSync(p, 'utf8')))
const before = new Map(A.streets.map(s => [s.id, s]))
const eq = (x, y) => Math.abs((x ?? NaN) - (y ?? NaN)) < 0.005 || (x == null && y == null)
const byCause = new Map(), moved = []
let sameCarriageway = 0, streetClassMoved = 0
for (const s of B.streets) {
  const o = before.get(s.id)
  if (!o) { moved.push(`${s.id}: NEW CHAIN`); continue }
  const a = o.seed, b = s.seed
  if (b.swept) { byCause.set('highway: seed carries no class constant (unread)', (byCause.get('highway: seed carries no class constant (unread)') || 0) + 1); continue }
  const dHW = b.pavementHW - a.pavementHW
  const sides = ['left', 'right'].filter(k => a[k] && b[k] && !eq(a[k].pavementHW, b[k].pavementHW))
  const ped = !eq(a.treelawn, b.treelawn) || !eq(a.sidewalk, b.sidewalk) || (a.pedRealm === false) !== (b.pedRealm === false)
  const street = ['primary', 'secondary', 'tertiary', 'local'].includes(s.class)
  if (Math.abs(dHW) < 0.005 && !sides.length) sameCarriageway++
  else {
    if (street) streetClassMoved++
    moved.push(`${s.id.padEnd(34)} ${s.class.padEnd(13)} Δcarriageway ${dHW >= 0 ? '+' : ''}${dHW.toFixed(2)} m${sides.length ? ` (survey sides ${sides.join('/')})` : ''}`)
  }
  if (ped) {
    const k = b.pedRealm === false && a.pedRealm !== false ? `${s.class}: walk + lawn removed (pedRealm:false)` : `${s.class}: walk/lawn ${a.treelawn}/${a.sidewalk} → ${b.treelawn}/${b.sidewalk} (record only; paint reads 1.5/1.5)`
    byCause.set(k, (byCause.get(k) || 0) + 1)
  }
}
console.log(`carriageway unchanged on ${sameCarriageway} chain(s); moved on ${moved.length} (street classes among them: ${streetClassMoved})`)
for (const [k, n] of [...byCause].sort((x, y) => y[1] - x[1])) console.log(`   ${String(n).padStart(4)}  ${k}`)
for (const m of moved) console.log(`   ${m}`)
process.exit(streetClassMoved ? 1 : 0)
