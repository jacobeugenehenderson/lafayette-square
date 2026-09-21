// claims-every-water-body-reaches-the-kit-material.mjs — DOES THE WATER ARRIVE?
//
// ⭐ THE INVARIANT: if a town's pour derived a water body, that body must reach
// the slab AND resolve to the kit water material at runtime. Both halves, because
// each fails differently and BOTH fail quietly:
//   · derived but not baked → the lake is a HOLE IN THE LAND. ① carves
//     `bb − (WATER ∪ INK)`, so the ground genuinely ends at the shore and nothing
//     fills what it left. This was the live state until 2026-09-20: huron's Lake
//     Erie was acquired, classified, derived into `layers.water`, and then dropped
//     by a bake that never read the layer. Nothing errored. The Designer drew it,
//     which is exactly why everyone believed the slab did too.
//   · baked but unrecognised → the body renders as a flat grey ground fill. A
//     `water=*` subtype nobody enumerated ('water:oxbow') takes that path, and a
//     grey lake looks like a design choice rather than a bug.
//
// ⛔ THIS IS A KIT CHECK, NOT AN LS CHECK. It walks every scene on disk and asks
// each the same question. A town with no water passes by having none — ⭐ and it
// says so out loud, because "0 water bodies" and "this check did not run" must
// never look the same.
//
// ⭐ It RESOLVES with the runtime's own `isWaterGroupId`, imported, not restated.
//
// ▶ MUTATION-TEST IT: comment out the `mapLayers.water` loop in bake-ground.js and
//   re-bake huron — this goes RED naming the body that vanished.
//
//   node checks/claims-every-water-body-reaches-the-kit-material.mjs
// Read-only. Exits 1 on water that was derived and cannot be seen.
import fs from 'fs'
import path from 'path'
import { isWaterGroupId } from '../src/components/waterMaterial.js'

const DATA = 'cartograph/data'
const BAKED = 'public/baked'
const fail = []
let scenesWithWater = 0, bodiesSeen = 0

const scenes = fs.readdirSync(DATA, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()

for (const scene of scenes) {
  const mapPath = path.join(DATA, scene, 'clean', 'map.json')
  if (!fs.existsSync(mapPath)) { console.log(`  ·  ${scene}: no clean/map.json — not poured, skipped`); continue }
  const water = JSON.parse(fs.readFileSync(mapPath, 'utf8')).layers?.water || []

  // ⭐ The slab is looked up by LOOK, and a scene may have several. Any baked
  // look whose directory exists is a slab an operator can be looking at.
  const looks = fs.existsSync(BAKED)
    ? fs.readdirSync(BAKED, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).filter(l => l === scene || l.startsWith(scene + '-'))
    : []

  if (!water.length) {
    console.log(`  ✅ ${scene}: 0 water bodies derived — nothing owed`)
    continue
  }
  scenesWithWater++
  bodiesSeen += water.length
  const subtypes = water.map(w => w.subtype || '(none)').join(', ')
  console.log(`  ·  ${scene}: ${water.length} water body/bodies derived — water=* subtype(s): ${subtypes}`)

  if (!looks.length) {
    console.log(`     (no baked look for this scene — nothing to check against yet)`)
    continue
  }
  for (const look of looks) {
    const gp = path.join(BAKED, look, 'ground.json')
    if (!fs.existsSync(gp)) continue
    const groups = JSON.parse(fs.readFileSync(gp, 'utf8')).groups || []
    const waterGroups = groups.filter(g => g.kind !== 'face' && isWaterGroupId(g.id))
    if (!waterGroups.length) {
      fail.push(`⛔ ${scene} → look '${look}': the pour derived ${water.length} water body/bodies and the slab has ` +
                `NO water group. In 3D that body is a hole in the land — ① carved it out and nothing filled it. ` +
                `▶ node cartograph/bake-ground.js --scene=${scene} --look=${look}`)
      continue
    }
    const empty = waterGroups.filter(g => !(g.vertexCount > 0) || !(g.indexCount > 0))
    if (empty.length) {
      fail.push(`⛔ ${scene} → look '${look}': water group(s) ${empty.map(g => g.id).join(', ')} are present but EMPTY ` +
                `(0 verts/indices). A group that draws nothing is indistinguishable from no lake at all.`)
      continue
    }
    const verts = waterGroups.reduce((n, g) => n + g.vertexCount, 0)
    console.log(`     ✅ look '${look}': ${waterGroups.length} water group(s) [${waterGroups.map(g => g.id).join(', ')}], ${verts} verts → the kit material`)
  }
}

console.log(`\n${scenesWithWater} scene(s) carry water · ${bodiesSeen} derived body/bodies examined.`)
// ⛔ "Nothing to check" is a RESULT, not a pass. If no town on disk has water, this
// check proves nothing and must say so rather than printing a green tick.
if (!bodiesSeen) console.log(`⚠️  NO TOWN ON DISK HAS DERIVED WATER — this check exercised nothing. It is not evidence.`)

if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} failure(s) — water that was derived and cannot be seen.`)
  process.exit(1)
}
console.log(`✅ every derived water body reaches the slab and resolves to the kit material.`)
