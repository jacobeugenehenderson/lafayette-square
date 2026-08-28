/**
 * THE ROSTER LIGHT MUST DESCRIBE THE OUTPUT, NOT THE INGREDIENTS.
 *
 * ⛔ THE DEFECT (Jacob, 2026-08-27): "the light shouldn't be green in the Salon if it's
 * not going to export the impostor." Every field the Salon's roster dot was derived from
 * is an INPUT fact — a chassis exists (`hasAuthoredChassis`), or we own a model that
 * literally is this species (`nativeModel`). Whether the impostor actually CAME OUT lives
 * in `<look>/trees-atlas.json`, written by a different machine (the Grove bakers), which
 * the Salon never opened. So the rail reported the ingredients and the operator read it
 * as the meal.
 *
 * ⭐ IT IS THE SAME LIE ONE RUNG DOWN FROM THE ONE ALREADY FIXED. The dot keyed on
 * botanical `coverage` — "the library COULD cover it" — until Tuliptree lit green and
 * opened blank; that moved it to "a composition exists". This moves it to "it EXPORTED".
 *
 * TWO DIRECTIONS, because the rail can lie by omission as well as by colour:
 *   A · GREEN BUT UNEXPORTED — a roster species the operator composed, whose impostor did
 *       not export. The dot read 🟢 and the tree renders as MESH at every distance. (It now
 *       reads 🟡 — "missing something". ⛔ Four states, no fifth: Jacob, 2026-08-27.)
 *   B · PLACED BUT UNEXPORTED — an asset the slab places whose impostors are absent,
 *       HOWEVER it got selected. B is the superset and needs no roster at all.
 *
 * ⛔ WHAT THIS CHECK MUST NOT CLAIM, AND DID IN ITS FIRST DRAFT. The slab's `species` is
 * the ASSET name AFTER substitution, not the roster species. `oak_pin` routes to the
 * `oak_white` asset; ksi-y-m-yn's census is European and its slab places American assets;
 * `bake-trees#pickVariant` falls back BY CATEGORY, which can select an asset no roster row
 * routes to at all. Joining slab-species → canonicalId therefore reports **substitution
 * working correctly** as a defect — it scored 91.7% of ksi-y-m-yn, every species of which
 * was fine (CLAUDE.md Layer 0 Q3: ask what the map looks like if it is CORRECT). The join,
 * where one is needed, is `routing[].libId`.
 *
 * ⭐ WHY B IS THE CHECK. "If the map places it, it must export" needs no roster, no
 * threshold, no routing and no operator who has already looked at the rail — only the two
 * artifacts every pour writes. Any town with a bake gets it free.
 *
 *   node scratch/claims-the-roster-light-tells-the-truth.mjs [scene ...]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { computeCoverage } from '../arborist/roster-coverage.js'

const ROOT = path.join(import.meta.dirname, '..')
const BAKED = path.join(ROOT, 'public/baked')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

const scenes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(BAKED).filter(d => existsSync(path.join(BAKED, d, 'trees.json')))

let failed = 0
console.log(`The roster light must describe the OUTPUT — ${scenes.length} scene(s)\n`)

for (const scene of scenes) {
  const dir = path.join(BAKED, scene)
  const trees = read(path.join(dir, 'trees.json'))
  const instances = trees.instances || []
  if (!instances.length) { console.log(`  ${scene.padEnd(24)} — 0 placements`); continue }

  const atlasPath = path.join(dir, 'trees-atlas.json')
  if (!existsSync(atlasPath)) {
    console.log(`  ➖ ${scene.padEnd(24)} no trees-atlas.json — this look has never been baked; nothing to claim`)
    continue
  }

  let cov
  try { cov = await computeCoverage(scene) }
  catch (e) {
    console.log(`  ➖ ${scene.padEnd(24)} no roster for this scene (${e.message.split('\n')[0]}) — skipped`)
    continue
  }
  // The roster row that OWNS an asset, via routing — never by assuming asset === canonicalId.
  const rowByAsset = new Map()
  for (const r of cov.species || []) {
    for (const rt of [].concat(r.routing || [])) {
      const id = typeof rt === 'string' ? rt : rt?.libId
      if (id && !rowByAsset.has(id)) rowByAsset.set(id, r)
    }
  }

  // ⛔ AN ABSENT KEY IS AN EMPTY SET, NOT AN UNKNOWN — and reading it the other way made this
  // check report ✅ for a look with ZERO impostors, which is the exact plausible-success it
  // exists to prevent. The atlas FILE existing is what says "this look has been baked"; that
  // is handled above. Once we are past it, a missing key means nothing exported, full stop.
  const atlas = read(atlasPath)
  const hasOverhead = new Set(Object.keys(atlas.overheadBySpecies || {}))
  const hasHero = new Set(Object.keys(atlas.heroImpostorBySpecies || {}))

  // What the slab actually ships, and how much of the map rides on it.
  const placed = new Map()
  for (const i of instances) placed.set(i.species, (placed.get(i.species) || 0) + 1)

  // ⛔ NAME THE TREES — BUT NOT WHEN THE ANSWER IS "ALL OF THEM". A carrier with ZERO
  // records is a whole-look fact ("this look's impostors were never baked"), and printing
  // it once per species buries the PARTIAL gaps — the species that individually failed to
  // capture, which is the only place a per-species name tells the operator anything new.
  const wholeLook = []
  for (const [carrier, set] of [['overhead', hasOverhead], ['hero', hasHero]]) {
    if (set.size === 0) wholeLook.push(carrier)
  }
  const findings = []
  for (const [sp, n] of placed) {
    const missing = [
      hasOverhead.size > 0 && !hasOverhead.has(sp) && 'overhead',
      hasHero.size > 0 && !hasHero.has(sp) && 'hero',
    ].filter(Boolean)
    if (!missing.length) continue
    const row = rowByAsset.get(sp)
    findings.push([sp, n, missing, row])
  }

  if (wholeLook.length) {
    failed++
    console.error(`  ⛔ ${scene.padEnd(24)} NO ${wholeLook.join(' and ').toUpperCase()} IMPOSTORS BAKED AT ALL — ` +
      `all ${instances.length} placements across ${placed.size} assets ship without them.\n` +
      `       This is a whole-look fact, not a per-species one: nothing was ever captured for this Look.\n` +
      `       Bake it in the Grove. ⚠️ A missing HERO set also switches the render to the legacy\n` +
      `       prominence path — ▶ node scratch/claims-every-shadowed-placement-renders.mjs`)
  }

  if (!findings.length && !wholeLook.length) {
    console.log(`  ✅ ${scene.padEnd(24)} all ${placed.size} placed assets exported their impostors`)
    continue
  }

  if (!findings.length) continue
  if (!wholeLook.length) failed++
  const exposed = findings.reduce((t, r) => t + r[1], 0)
  console.error(`  ⛔ ${scene.padEnd(24)} ${exposed} of ${instances.length} placements ` +
    `(${(100 * exposed / instances.length).toFixed(1)}%) render as MESH at every distance — no impostor exported:`)
  for (const [sp, n, missing, row] of findings) {
    if (row && row.authoringState === 'composed') {
      console.error(`       A · GREEN BUT UNEXPORTED  ${sp} (${n}) — missing ${missing.join(' + ')}; ` +
        `roster row "${row.species}" is composed (greenBy=${row.greenBy}) so the rail reads 🟢`)
    } else {
      console.error(`       B · PLACED BUT UNEXPORTED ${sp} (${n}) — missing ${missing.join(' + ')}; ` +
        `${row ? `routed from "${row.species}" (${row.authoringState})` : 'selected by CATEGORY FALLBACK — no roster row routes to it'}`)
    }
  }
}

console.log()
if (failed) {
  console.error(`⛔ ${failed} scene(s) place trees whose impostors never exported.`)
  console.error(`   A → the rail LIES about these: composed and green, shipping as mesh. Re-bake in the`)
  console.error(`       Grove; if it keeps failing, the CAPTURE is the defect, not the composition.`)
  console.error(`   B → no roster row owns these, so there is no light to be wrong. A category-fallback`)
  console.error(`       asset can ship without ever passing through the Salon — that is the gap.`)
  process.exit(1)
}
console.log(`✅ every shipped species has a roster row and exported its impostors.`)
