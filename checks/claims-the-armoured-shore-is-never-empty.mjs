// claims-the-armoured-shore-is-never-empty.mjs — IS THERE A WALL AT EVERY DISTANCE?
//
// ⭐⭐ THE INVARIANT: every armoured face of every baked town yields FAR-FIELD
// geometry. Not "some shore has stone near the camera" — every armoured face, with
// no camera in the picture at all.
//
// ⛔⛔ WHY IT EXISTS. The revetment shipped gating BOTH its loops on a 90 m camera
// radius, so past that there was no bed and no stone: the wall did not degrade with
// distance, it VANISHED. Jacob, 2026-09-23: "IRL a wall doesn't disappear when it
// gets far away." That breaks his own close-inspection ruling — generate near the
// camera, ⛔ never an LOD that degrades to nothing. Nobody chose that behaviour; the
// radius was inherited from a harness that only ever looked close, and it was the
// only mechanism present. This check is what stops it coming back.
//
// ⛔ IT TESTS THROUGH THE PLAYER'S OWN MODULES — revetmentFromSlab for the faces and
// revetmentDrape at the component's FAR_OCTAVES — so it cannot drift from what
// renders. A check that re-implemented the far layer would agree with itself forever.
//
// ⚠️ HONEST LIMIT, SAID RATHER THAN PAPERED OVER: this proves the geometry EXISTS for
// every armoured metre. It does NOT prove pixels reach the screen at hero distance —
// that needs a render, and this brief is explicit that "does it look like rock" is not
// checkable and one must not write a check that pretends. The pixel question is an
// eye-gate and stays one.
//
// ⭐ MUTATION TEST: set FAR_OCTAVES out of range, make the far build throw, or filter
// a face out of revetmentFaces, and this must go RED.
//
//   node checks/claims-the-armoured-shore-is-never-empty.mjs         # every baked town
//   node checks/claims-the-armoured-shore-is-never-empty.mjs huron   # just that one
// Read-only. Exits 1 if any armoured face has no far-field geometry.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'
import { drapeGlobals, revetmentDrape } from '../src/lib/revetmentDrape.js'

// ⛔ Read the resolution OUT of the component rather than restating it — the whole
// point is that this check moves when the player moves.
const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'SlabRevetment.jsx'), 'utf8')
const m = SRC.match(/const FAR_OCTAVES\s*=\s*(\d+)/)
if (!m) { console.log('⛔ cannot find FAR_OCTAVES in SlabRevetment.jsx — the far layer may have been removed'); process.exit(1) }
const FAR_OCTAVES = Number(m[1])

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv[2] || null
let failed = false, towns = 0, without = 0

for (const look of readdirSync(join(ROOT, 'public', 'baked'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort()) {
  if (only && look !== only) continue
  const p = join(ROOT, 'public', 'baked', look, 'revetment.json')
  if (!existsSync(p)) { console.log(`  ${look.padEnd(18)} no revetment.json — nothing to cover`); without++; continue }
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  const armoured = revetmentFaces(doc).filter(f => f.anyArmour)
  if (!armoured.length) { console.log(`  ${look.padEnd(18)} no armoured shore — nothing to cover`); without++; continue }

  towns++
  let tris = 0, emptyFaces = []
  const coveredArcs = new Set()
  for (const f of armoured) {
    let ok = false
    try {
      const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCTAVES })
      const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, octaves: FAR_OCTAVES, globals: G })
      if (d?.stats?.tris > 0) { ok = true; tris += d.stats.tris; coveredArcs.add(f.arcIndex) }
    } catch (e) { emptyFaces.push(`${f.key} (threw: ${e.message})`) }
    if (!ok && !emptyFaces.some(x => x.startsWith(f.key))) emptyFaces.push(f.key)
  }
  // ⛔⛔ COVERED vs CLAIMED, AND THIS ASSERTION IS THE POINT OF THE CHECK.
  // The first cut only asked "did every face I was HANDED produce geometry", which
  // cannot see a face that never arrived. Mutation-tested: dropping one arc inside
  // revetmentFromSlab left 2.8 km of shore with no geometry at all and this check went
  // GREEN — while printing "5137 m of 7957 m" on the same line. A number beside a
  // verdict is not an assertion. ⭐ The armoured metres come from the ARTIFACT, which
  // the adapter cannot silently shrink, so the two disagree the moment a face is lost.
  // ⚠️ Summed over unique ARCS: a two-faced arc yields two faces for one armoured
  // length, and per-face summing would double-count it into a false pass.
  const claimed = doc.totals?.armouredM ?? 0
  let covered = 0
  for (const a of doc.arcs || []) if (coveredArcs.has(a.index)) covered += a.armouredM || 0
  const shortfall = claimed - covered
  const good = emptyFaces.length === 0 && shortfall <= Math.max(1, claimed * 0.01)
  console.log(`  ${good ? '✅' : '⛔'} ${look}/revetment  ${armoured.length} armoured face(s) · far layer at octaves ${FAR_OCTAVES} · ` +
    `${tris.toLocaleString()} tris covering ${covered.toFixed(0)} m of ${claimed} m armoured`)
  for (const e of emptyFaces) console.log(`       ⛔ NO FAR GEOMETRY: face ${e} — this stretch is empty at distance`)
  if (shortfall > Math.max(1, claimed * 0.01)) {
    console.log(`       ⛔ ${shortfall.toFixed(0)} m OF ARMOURED SHORE IS UNACCOUNTED FOR. The artifact claims ${claimed} m; ` +
      `the faces reaching the far layer cover ${covered.toFixed(0)} m. A face is being dropped before it is ever built.`)
  }
  if (!good) failed = true
}

console.log(`\n  ${towns} town(s) with armoured shore · ${without} without`)
console.log('  ⚠️ proves the geometry exists for every armoured metre — NOT that it reaches the screen. That is an eye-gate.')
if (failed) { console.log('\n⛔ part of an armoured shore has no far-field geometry — the wall vanishes at distance there'); process.exit(1) }
console.log('\n✅ every armoured face has far-field geometry at every distance')
