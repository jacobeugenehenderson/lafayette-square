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
// ▶ node checks/claims-proto-frozen-matches-live.mjs [scene ...]
import fs from 'fs'
import { mintProtopolygon } from '../src/lib/tileGround.js'
import { ribbonsPath, ribbonScenes } from './_scenes.mjs'
import { mintInputsOf } from '../cartograph/mintInputs.mjs'
import { homeLookOf } from '../cartograph/homeLook.mjs'

const scenes = ribbonScenes()
const RIB = ribbonsPath

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
  // ⭐ THE LIVE SIDE IS MINTED FROM THE POUR'S OWN INPUTS — `cartograph/mintInputs.mjs`, the one builder derive.js calls:
  // the simplified skeleton tessellated, `hard`, the boundary, the coast and its arcs, the bb. ⛔ This check once built its own
  // copy twice over and was wrong both times: from the densified chains (2026-09-06), then without boundary / coast /
  // coastArcs / bb (Zob, 2026-10-25), so every coast town read STALE over a correct artifact. A wrong instruction ("re-pour")
  // is worse than a wrong number.
  let MI
  try { MI = mintInputsOf(scene, rb.streets, homeLookOf(scene)) } catch (e) { console.log(`   ${e.message} — REFUSING to check`); failed = true; continue }
  if (MI.unjoined.length) { console.log(`   ⛔ ${MI.unjoined.length} chain(s) have no simplified geometry — REFUSING, exactly as derive.js does`); failed = true; continue }
  const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
  const L = quiet(() => mintProtopolygon({ streets: MI.streets, gradeSep: MI.gradeSep, boundary: MI.boundary, coast: MI.coast, coastArcs: MI.coastArcs, bb: MI.bb, eps: F.eps }))
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
