#!/usr/bin/env node
/**
 * claims-every-baked-species-has-an-impostor — every species in a baked census is in that slab’s atlas.
 *
 * ⛔⛔ A SPECIES IN THE CENSUS THAT IS NOT IN THE ATLAS SHIPS AS MESH AT EVERY DISTANCE.
 * It is not a missing tree — it is a tree that draws its full LOD0 geometry from the far
 * bank, which is how 2,251 placements once ended up permanently on mesh, and on a big
 * town it is a frame-rate cliff rather than a visual one. The Grove surfaces it as the
 * "no impostor: <name>" banner; that banner is an operator's eye on ONE look, in ONE
 * app, that has to be open. This is the same fact as a command, over every slab on disk.
 *
 * ⭐ `barkBySpecies` IS THE HONEST TEST, and the Grove's own gate says why: bake-look
 * writes a species there exactly when it rewrote that species' GLB into THIS atlas. It is
 * a fact about the artifact rather than about anybody's roster, so it needs no list and
 * covers a town nobody has looked at. (`Grove.jsx#unrewrittenSpecies`.)
 *
 * Instance, 2026-09-21 — and the shape is the one Layer 0 q2 names: huron's slab carried
 * 1,679 `birch` placements for a species that was never selected, pinned or built. The
 * substitution table resolves `Birch, River → birch`, and `birch` is a library id with no
 * composition. It was only ever visible as a banner in an app, so it survived a day of
 * pours. ⭐ The ROOT was upstream — every Grove bake had been dying at step 1 since
 * 2026-09-20 (`claims-a-look-keyed-tool-is-called-with-its-look`) — and the first
 * successful bake redistributed all 1,679 onto shipping species and cleared this to zero.
 * ⛔ Which is exactly why the check exists: nothing between those two facts was measured,
 * and the only instrument was a human looking at a banner.
 *
 * ⛔ IT DOES NOT JUDGE THE SUBSTITUTION TABLE. A row pointing at an unbuilt library id is
 * the operator's authoring and is resolved downstream at bake time — flagging it would
 * call a working gesture a defect (`CLAUDE.md` Layer 0 q3). The SLAB is the contract, so
 * the slab is what gets asked.
 *
 *   node checks/claims-every-baked-species-has-an-impostor.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok  = (m) => console.log(`  ✅ ${m}`)

console.log('\nEvery species in a baked census is in that slab’s atlas')
const bakedDir = join(REPO, 'public', 'baked')
const looks = existsSync(bakedDir)
  ? readdirSync(bakedDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : []
// ⛔ Zero slabs is not a pass. `public/baked` is gitignored, so an empty tree means this
// check measured nothing — and a check that silently measures nothing is worse than none.
if (!looks.length) bad(`no looks under ${bakedDir} — nothing was measured. Pour a slab, or say why.`)

for (const look of looks) {
  const tPath = join(bakedDir, look, 'trees.json')
  const aPath = join(bakedDir, look, 'trees-atlas.json')
  if (!existsSync(tPath)) { console.log(`  ·  ${look}: no trees.json — honest zero, skipped`); continue }
  let instances
  try { instances = JSON.parse(readFileSync(tPath, 'utf8')).instances || [] }
  catch (e) { bad(`${look}: trees.json is unreadable (${e.message})`); continue }
  if (!instances.length) { console.log(`  ·  ${look}: 0 placements — honest zero, skipped`); continue }

  if (!existsSync(aPath)) {
    bad(`${look}: ${instances.length} placements but NO trees-atlas.json — every tree ships as mesh. `
      + `Re-bake the Grove for this look.`)
    continue
  }
  let bark
  try { bark = JSON.parse(readFileSync(aPath, 'utf8')).barkBySpecies }
  catch (e) { bad(`${look}: trees-atlas.json is unreadable (${e.message})`); continue }
  if (!bark) {
    bad(`${look}: trees-atlas.json has no barkBySpecies — the atlas cannot say which species it `
      + `rewrote, so no tree in this slab can be trusted to have an impostor.`)
    continue
  }

  const counts = new Map()
  for (const t of instances) counts.set(t.species, (counts.get(t.species) || 0) + 1)
  const missing = [...counts].filter(([sp]) => !bark[sp]).sort((a, b) => b[1] - a[1])
  if (missing.length) {
    const n = missing.reduce((s, [, c]) => s + c, 0)
    bad(`${look}: ${n} of ${instances.length} placements are species this atlas never rewrote — `
      + `they render as MESH at every distance: ${missing.map(([sp, c]) => `${sp} (${c})`).join(', ')}. `
      + `▶ withhold them from the roster, or bake the Grove so the atlas carries them.`)
  } else {
    ok(`${look}: ${instances.length} placements across ${counts.size} species, all in the atlas`)
  }
}

console.log(failed ? `\n⛔ ${failed} failure(s)\n` : '\n✅ every baked species has an impostor\n')
process.exit(failed ? 1 : 0)
