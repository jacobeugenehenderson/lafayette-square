#!/usr/bin/env node
// ⭐ WHICH DISEASE IS THE FAT BAND? — the discriminating measurement, not a thickness histogram.
//
// MEASURED (`claims-proto-stack-disjoint`): the curb band's MEDIAN thickness is exactly
// `curbWidth`, so most blocks inset correctly — but 34% of curb rings are thicker than 1 m and
// carry 99.5% of the band's area. A few rings ARE the overlap. ⛔ That is a LOCATION, not a
// mechanism, and two different diseases produce it:
//
//   VANISHING PIECE — a pinching block SPLITS under a deeper inset and one lobe falls below
//     `offsetRingVariable`'s area floor. The deeper set has FEWER pieces, that lobe is never
//     subtracted, and `differenceRings(shallow, deep)` hands it back WHOLE.
//   FOLD — the offset crosses itself instead of splitting (`POLYGON-FIRST D6a`: the
//     averaged-normal branch, ~70% of crossing endpoints). Piece count HOLDS; the ring carries
//     repeated vertices and the difference mishandles the reversed winding.
//
// ⭐ They have DIFFERENT CURES, which is why guessing is not allowed here.
// ⚠️ AND EITHER WAY IT BEARS ON `RIBBONS §1` GATE B, which measured whole blocks VANISHING
// under a contour offset and called that "loud and countable — better than folding." A block
// going missing is loud. A PIECE going missing inside a block that still renders is SILENT: a
// band just floods the hole where the subtraction should have been. Same failure, smaller
// scale, opposite visibility — the shape Layer 0 calls worst.
//
// ▶ node checks/claims-proto-band-flood-mechanism.mjs [scene ...]
import fs from 'fs'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
// ⛔⛔ THIS PROBE NAMES PRODUCER STAGES BY STRING and therefore rots the moment they are renamed.
// It did: `PROTO_DUMP`'s stages moved from `hw / hw+cw / WB` (measured from ①) to
// `curb / curb+cw / curb+WB` when ③'s subject became the eased curb, and this file threw
// `Cannot read properties of undefined` — a break nobody sees, because nothing runs it by default.
// ⭐ Two instruments rotted the same way in one day. A probe keyed on a producer's internal LABELS
// is coupled to it without a compiler to say so; assert the stages exist before reading them.

process.env.PROTO_DUMP = '1'
const scenes = feedScenes()
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`

let verdictAll = []
for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY`); continue }
  globalThis.__PROTO_DUMP = []
  const f = feed(scene)
  if (!f) continue
  buildProto(f, { quiet: false })
  const D = globalThis.__PROTO_DUMP
  const st = (b, n) => b.stages.find(s => s.name === n)
  // a block "floods" when the curb band (hw − hw+cw) is far thicker than cw can explain:
  // its area exceeds what a cw-wide annulus around that perimeter could be.
  // ⛔ LOUD IF THE STAGES MOVED AGAIN — never a silent undefined
  const missing = D.length ? ['curb', 'curb+cw', 'curb+WB'].filter(n => !st(D[0], n)) : []
  if (missing.length) { console.log(`⛔ PROTO_DUMP no longer emits stage(s): ${missing.join(', ')} — this probe is keyed on names the producer renamed. NOT a pass.`); process.exit(1) }
  const drops = D.filter(b => st(b, 'curb+cw').pieces < st(b, 'curb').pieces)
  const folds = D.filter(b => b.stages.some(s => s.repeated > 0))
  const lost  = D.filter(b => st(b, 'curb').area > 0 && (st(b, 'curb').area - st(b, 'curb+cw').area) / st(b, 'curb').area > 0.5)
  console.log(`\n${scene} — ${D.length} blocks`)
  console.log(`  piece count DROPS between hw and hw+cw ....... ${drops.length}   ← the vanishing-piece signature`)
  console.log(`  any ring carries a REPEATED vertex ........... ${folds.length}   ← the fold signature`)
  console.log(`  >50% of area lost over a ${'cw'}-deep step ......... ${lost.length}   ← the flood, however caused`)
  console.log(`  hit the capacity guard ....................... ${D.filter(b => b.capped).length}`)
  const both = drops.filter(b => lost.includes(b)).length
  console.log(`  floods explained by a piece drop ............. ${both} of ${lost.length}`)
  if (lost.length) {
    const worst = [...lost].sort((a, b) => (st(b,'curb').area - st(b,'curb+cw').area) - (st(a,'curb').area - st(a,'curb+cw').area)).slice(0, 5)
    console.log('  worst five (block · ring m² · pieces hw→hw+cw→WB · area hw→hw+cw · repeated):')
    for (const b of worst) console.log(`     #${String(b.block).padStart(3)}  ${st(b,'curb').area.toFixed(0).padStart(7)} m²  ${st(b,'curb').pieces}→${st(b,'curb+cw').pieces}→${st(b,'curb+WB').pieces}   ${st(b,'curb').area.toFixed(0)}→${st(b,'curb+cw').area.toFixed(0)}   rep ${b.stages.map(s=>s.repeated).join('/')}`)
  }
  verdictAll.push({ scene, drops: drops.length, folds: folds.length, lost: lost.length, both })
}
console.log('\n── VERDICT ────────────────────────────────────────────────')
for (const v of verdictAll) {
  const call = v.lost === 0 ? 'no floods to explain'
    : v.both / v.lost > 0.8 ? '⭐ VANISHING PIECE — the deeper inset loses a lobe'
    : v.folds > v.drops ? '⭐ FOLD — piece counts hold, rings carry repeated vertices'
    : '⛔ NEITHER SIGNATURE DOMINATES — cause NOT established; do not pick one'
  console.log(`  ${v.scene.padEnd(18)} ${call}`)
}
console.log()
