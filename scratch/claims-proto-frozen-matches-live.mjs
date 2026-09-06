#!/usr/bin/env node
// ⭐⭐⭐ THE FREEZE REPRODUCES THE CONSTRUCTION — the one claim a frozen artifact must earn.
//
// `WALL.md §1`: freezing WRONG data is worse than not freezing at all, because it "launders
// garbage into authority" — everything downstream then trusts it unconditionally. So the
// artifact is not trustworthy because it exists; it is trustworthy because it is the SAME
// OBJECT the construction builds. This check mints ① live from the same frame and compares.
//
// ⛔ IT IS NOT A TAUTOLOGY EVEN THOUGH ONE FUNCTION SERVES BOTH CALLERS. What it catches is
// the artifact going STALE: `ribbons.protopolygon` is written at pour time, and the frame can
// move under it afterwards (a re-skeleton, an overlay edit, a clip change). Prebake freezing a
// fact whose input has since changed is `PREBAKE §2.5a`'s exact defect — "a frozen index
// outlives a mutation of the geometry it indexes, with no re-derive and no refusal."
//
// ⛔ RUN IT AFTER EVERY POUR. A pass means the artifact IS the construction; a fail means the
// scene needs re-pouring and the map you are looking at was built from a stale ①.
// ▶ node scratch/claims-proto-frozen-matches-live.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon } from '../src/lib/tileGround.js'

const scenes = process.argv.slice(2)
if (!scenes.length) scenes.push('lafayette-square', 'hipointe-demun')
const RIB = (s) => s === 'lafayette-square' ? 'src/data/ribbons.json' : `cartograph/data/${s}/clean/ribbons.json`

let failed = false
for (const scene of scenes) {
  const path = RIB(scene)
  if (!fs.existsSync(path)) { console.log(`\n${scene}: no ribbons at ${path} — SKIPPED LOUDLY, not checked`); failed = true; continue }
  const rb = JSON.parse(fs.readFileSync(path, 'utf8'))
  const F = rb.protopolygon
  console.log(`\n${scene}`)
  if (!F) {
    // ⛔ NOT a failure of this check — a legitimate state for a scene not yet re-poured. But it
    // is reported LOUDLY, because "no ① here" and "① matches" must never read the same.
    console.log('   ⚠️  NO FROZEN ① — this scene has not been poured since ① landed.')
    console.log('       The tool will re-derive it live and say so. Pour to freeze it.')
    continue
  }
  const streets = rb.streets.filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  const gradeSep = rb.streets.filter(s => s?.points?.length >= 2 && s.gradeSeparated)
  const L = mintProtopolygon({ streets, gradeSep, eps: F.eps })
  const q = (v) => Math.round(v * 1e6) / 1e6      // the artifact's own write precision
  const ringsEq = F.rings.length === L.rings.length && F.rings.every((r, i) =>
    r.length === L.rings[i].length && r.every((p, j) => q(p[0]) === q(L.rings[i][j][0]) && q(p[1]) === q(L.rings[i][j][1])))
  const ownersEq = F.owners.length === L.owners.length && F.owners.every((o, i) => {
    const b = L.owners[i]
    return o.skelId === b.skelId && o.side === b.side && o.segOrd === b.segOrd && !!o.gradeSeparated === !!b.gradeSeparated
  })
  const labelsEq = F.labels.length === L.labels.length && F.labels.every((a, i) =>
    a.length === L.labels[i].length && a.every((v, j) => v === L.labels[i][j]))
  const ok = ringsEq && ownersEq && labelsEq
  if (!ok) failed = true
  console.log(`   rings   ${ringsEq ? '✅' : '⛔'}  frozen ${F.rings.length} vs live ${L.rings.length}`)
  console.log(`   owners  ${ownersEq ? '✅' : '⛔'}  frozen ${F.owners.length} vs live ${L.owners.length}`)
  console.log(`   labels  ${labelsEq ? '✅' : '⛔'}  frozen ${F.labels.length} arrays vs live ${L.labels.length}`)
  if (!ok) console.log('   ⛔ THE ARTIFACT IS STALE — the frame moved under it. Re-pour this scene.')
}
console.log(`\n${failed ? '⛔ FAIL' : '✅ PASS'}\n`)
process.exit(failed ? 1 : 0)
