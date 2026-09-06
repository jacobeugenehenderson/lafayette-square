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
// ▶ node scratch/claims-proto-band-flood-mechanism.mjs [scene ...]
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

process.env.PROTO_DUMP = '1'
const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`

let verdictAll = []
for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY`); continue }
  globalThis.__PROTO_DUMP = []
  buildTileGround(JSON.parse(fs.readFileSync(path, 'utf8')), { grout: 'proto', smooth: 0 })
  const D = globalThis.__PROTO_DUMP
  const st = (b, n) => b.stages.find(s => s.name === n)
  // a block "floods" when the curb band (hw − hw+cw) is far thicker than cw can explain:
  // its area exceeds what a cw-wide annulus around that perimeter could be.
  const drops = D.filter(b => st(b, 'hw+cw').pieces < st(b, 'hw').pieces)
  const folds = D.filter(b => b.stages.some(s => s.repeated > 0))
  const lost  = D.filter(b => st(b, 'hw').area > 0 && (st(b, 'hw').area - st(b, 'hw+cw').area) / st(b, 'hw').area > 0.5)
  console.log(`\n${scene} — ${D.length} blocks`)
  console.log(`  piece count DROPS between hw and hw+cw ....... ${drops.length}   ← the vanishing-piece signature`)
  console.log(`  any ring carries a REPEATED vertex ........... ${folds.length}   ← the fold signature`)
  console.log(`  >50% of area lost over a ${'cw'}-deep step ......... ${lost.length}   ← the flood, however caused`)
  console.log(`  hit the capacity guard ....................... ${D.filter(b => b.capped).length}`)
  const both = drops.filter(b => lost.includes(b)).length
  console.log(`  floods explained by a piece drop ............. ${both} of ${lost.length}`)
  if (lost.length) {
    const worst = [...lost].sort((a, b) => (st(b,'hw').area - st(b,'hw+cw').area) - (st(a,'hw').area - st(a,'hw+cw').area)).slice(0, 5)
    console.log('  worst five (block · ring m² · pieces hw→hw+cw→WB · area hw→hw+cw · repeated):')
    for (const b of worst) console.log(`     #${String(b.block).padStart(3)}  ${st(b,'hw').area.toFixed(0).padStart(7)} m²  ${st(b,'hw').pieces}→${st(b,'hw+cw').pieces}→${st(b,'WB').pieces}   ${st(b,'hw').area.toFixed(0)}→${st(b,'hw+cw').area.toFixed(0)}   rep ${b.stages.map(s=>s.repeated).join('/')}`)
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
