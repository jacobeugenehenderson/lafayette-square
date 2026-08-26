/**
 * THE INVARIANT: the slab renders exactly as many meshes as the bars ORDERED.
 *
 * ⭐ Jacob, 2026-08-25: "There should be exactly as many meshes as I ordered with the bar
 * placement." That is the whole contract of the mesh bar. Any other number means geometry
 * is reaching the map for a reason the operator did not choose — and geometry is the
 * expensive asset the impostor foundation exists to avoid.
 *
 * ⛔ WHY THIS IS A CHECK AND NOT A NOTE. The leak was reported to Jacob as PROGRESS —
 * "mesh placements 2,251 → 1,925" — as though a smaller breach were a smaller problem. It
 * is the same breach. A count that moves in the right direction while violating the
 * invariant is not progress, and stating it as a delta hides that. The bar orders 166; the
 * slab rendered 1,896.
 *
 * ORDERED = species in the MESH tier (green ∧ above the mesh bar, ± pin/withhold)
 *           ∧ the tallest heroGeomFraction of placements by dbh.
 * ACTUAL  = every placement whose species has no hero impostor record, because the
 *           runtime has nothing else to draw and falls back to geometry.
 *
 *   node scratch/claims-mesh-equals-the-bar.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveGrove } from '../arborist/grove-eligibility.mjs'
import { computeCoverage } from '../arborist/roster-coverage.js'

const ROOT = path.join(import.meta.dirname, '..')
const SCENE = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : 'lafayette-square'
const HERO_GEOM_FRACTION = 0.15   // InstancedTrees default; ?heroGeom= overrides at runtime

const design = JSON.parse(readFileSync(path.join(ROOT, `public/looks/${SCENE}/design.json`), 'utf8'))
const atlas = JSON.parse(readFileSync(path.join(ROOT, `public/baked/${SCENE}/trees-atlas.json`), 'utf8'))
const instances = JSON.parse(readFileSync(path.join(ROOT, `public/baked/${SCENE}/trees.json`), 'utf8')).instances || []
const coverage = await computeCoverage(SCENE)

const threshold = design.groveThreshold || {}
const board = resolveGrove(coverage.species, threshold)
const hero = new Set(Object.keys(atlas.heroImpostorBySpecies || {}))

const meshSpecies = new Set()
for (const b of board.filter(b => b.tier === 'mesh')) for (const l of (b.ownsLibIds || [])) meshSpecies.add(l)

const dbhs = instances.map(i => Number(i.dbh) || 0).sort((a, b) => a - b)
const cut = dbhs[Math.floor((1 - HERO_GEOM_FRACTION) * (dbhs.length - 1))]
// ⛔⛔ TWO DIFFERENT NUMBERS, AND I CONFLATED THEM (Jacob caught it, 2026-08-25):
// "How are the meshes being selected? Your leak might just be what I asked for."
// He was right. What the RUNTIME implements is `heroGeomFraction` — the tallest 15% of
// ALL placements by dbh keep geometry as anchors. It NEVER READS meshTopN: the mesh bar
// persists, gates the capture pool, and does not control geometry at all.
// So ANCHORS are ordered and correct; only the no-impostor placements are the breach.
// My first version measured "mesh-tier species ∧ tallest 15%", which is the INTENDED
// model and not the built one, and reported 253 ordered against 463 — both wrong.
const anchors = instances.filter(i => (Number(i.dbh) || 0) >= cut)
const forced = instances.filter(i => (Number(i.dbh) || 0) < cut && !hero.has(i.species))
const ordered = anchors.length
// ⚠️ The mesh bar's intended contract, reported so the gap between built and intended is
// visible rather than assumed either way.
const intended = instances.filter(i => meshSpecies.has(i.species) && (Number(i.dbh) || 0) >= cut).length

console.log(`scene ${SCENE} — ${instances.length} placements`)
console.log(`  bars: mesh rows ${threshold.meshTopN ?? '(unset)'} / impostor rows ${threshold.topN ?? '(unset)'}`)
console.log(`  mesh-tier species: ${[...meshSpecies].join(', ') || '(none)'}`)
console.log(`  ANCHORS (heroGeomFraction ${HERO_GEOM_FRACTION}, dbh ≥ ${cut}): ${ordered}   ← ordered, correct`)
console.log(`  FORCED  (dbh < cut, no impostor)              : ${forced.length}   ← the breach`)
console.log(`  total geometry drawn: ${ordered + forced.length} of ${instances.length}`)
console.log(`  ⚠️ if the mesh BAR controlled geometry it would order ${intended} — it does not; the runtime never reads meshTopN`)

if (forced.length) {
  const bySpecies = new Map()
  for (const i of forced) bySpecies.set(i.species, (bySpecies.get(i.species) || 0) + 1)
  console.error(`\n⛔ ${forced.length} placement(s) render as GEOMETRY because their species has no impostor.`)
  console.error('   The bar did not order these. Each is the most expensive asset available,')
  console.error('   chosen because the cheapest one was never captured.\n')
  for (const [sp, n] of [...bySpecies].sort((a, b) => b[1] - a[1])) {
    // ⛔ "NO ROSTER ROW" IS NOT "THE CENSUS NEVER ASKS FOR IT", and printing the second
    // was a confident wrong cause — the class that dispatches someone to fix the wrong
    // thing. platanus_acerifolia has no OWNING row and is routed from FOUR census rows
    // (sycamore American, Planetree London, Sycamore); quercus_alba from three. They are
    // legitimate substitution targets. What they lack is an impostor, not a reason to exist.
    const owner = board.find(b => (b.ownsLibIds || []).includes(sp)) || board.find(b => b.canonicalId === sp)
    const routedFrom = coverage.species.filter(r => (r.covering || []).some(v => v.libId === sp))
    const why = owner
      ? (owner.tier === 'out' ? `owned by "${owner.species}" — ${owner.why}` : 'eligible; CAPTURE FAILED')
      : routedFrom.length
        ? `substitution target for ${routedFrom.length} census row(s) (${routedFrom.slice(0, 2).map(r => r.species).join(', ')}) — needs an impostor`
        : 'not routed from any census row — why is the slab placing it?'
    console.error(`   ${String(n).padStart(5)}  ${sp.padEnd(26)} ${why}`)
  }
  console.error(`\n❌ FAIL — ${forced.length} placement(s) draw geometry nobody ordered (on top of ${ordered} legitimate anchors).`)
  process.exit(1)
}
console.log('\n✅ PASS — the slab renders exactly the geometry the bars ordered.')
