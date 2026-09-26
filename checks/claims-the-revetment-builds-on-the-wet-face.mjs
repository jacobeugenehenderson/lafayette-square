// claims-the-revetment-builds-on-the-wet-face.mjs — DOES THE STONE FACE THE WATER?
//
// ⭐⭐ THE INVARIANT: for every armoured station the player will build on, the side
// the BUILDERS extrude toward is the side the DRAWN WATER is on.
// ⭐ Ruled 2026-09-26 (Jacob): "The drawn water's edge IS the mapped shoreline, and the
// revetment sits on it." Until then "wet" here meant "reads lower in the lidar".
//
// ⛔⛔ WHY THIS EXISTS AND WHY IT IS NOT THE CHECK NEXT DOOR.
// `claims-the-shore-knows-which-side-is-wet.mjs` proves `wetSideOf` RESOLVES an
// answer for every build-worthy arc. It says nothing about whether the CONSUMER
// then applies that answer the right way round — and that is a separate,
// silent, one-character mistake: `faces` names the water's side of the TRACE,
// while `revetmentDrape.js` extrudes toward LEFT of the walk, so a face stamped
// `right` must be built on the REVERSED trace. Read that backwards and:
//   · the stone lands in exactly the right place, with the right footprint
//   · the slope leans inland, the wetted band paints the dry side, and the
//     drape's normals point down
// ⚠️ Invisible in every oblique view. Visible only from a camera at the waterline.
// That is the failure this kit rates worst — plausible, and wrong.
//
// ⛔ AND IT IS TESTED THROUGH THE MAP'S OWN CODE, not a restatement of it. This
// imports `src/lib/revetmentFromSlab.js` — the module `SlabRevetment.jsx` uses —
// so if the orientation rule there changes, this moves with it. A check that
// re-implemented the rule would agree with itself forever.
//
// ⭐ MUTATION TEST: flip BUILD_SIDE in revetmentFromSlab.js and this must go RED.
// A green run against an unflippable check proves nothing.
//
//   node checks/claims-the-revetment-builds-on-the-wet-face.mjs         # every baked town
//   node checks/claims-the-revetment-builds-on-the-wet-face.mjs huron   # just that one
// Read-only. Exits 1 if any town builds stone toward its dry side.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revetmentFaces, BUILD_SIDE } from '../src/lib/revetmentFromSlab.js'
import { drawnWaterTest } from '../cartograph/shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv[2] || null
let failed = false, townsChecked = 0, townsWithout = 0

const looks = readdirSync(join(ROOT, 'public', 'baked'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name).sort()

for (const look of looks) {
  if (only && look !== only) continue
  const revPath = join(ROOT, 'public', 'baked', look, 'revetment.json')
  if (!existsSync(revPath)) { console.log(`  ${look.padEnd(18)} no revetment.json — nothing to orient`); townsWithout++; continue }
  const doc = JSON.parse(readFileSync(revPath, 'utf8'))
  if (!doc.arcs?.length) { console.log(`  ${look.padEnd(18)} revetment.json has no arcs — this town has no shoreline`); townsWithout++; continue }

  // The drawn water the bake itself read, so "wet" means here what it meant there; the
  // terrain only for its grid step, which is the probe.
  const scene = doc.scene || look
  const tMeta = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json')
  const mPath = join(ROOT, 'cartograph', 'data', scene, 'clean', 'map.json')
  if (!existsSync(tMeta) || !existsSync(mPath)) {
    // ⛔ Not a pass. The artifact exists and claims faces; we simply cannot audit it.
    console.log(`  ⚠️ ${look.padEnd(16)} revetment.json present but scene "${scene}" has no clean/terrain.json or clean/map.json — CANNOT VERIFY`)
    failed = true; continue
  }
  const tm = JSON.parse(readFileSync(tMeta, 'utf8'))
  const probeM = Math.min((tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1), (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1))
  const inWater = drawnWaterTest((JSON.parse(readFileSync(mPath, 'utf8')).layers?.water || [])
    .filter(w => w?.ring?.length >= 3).map(w => w.ring.map(p => [p.x ?? p[0], p.z ?? p[1]])))

  townsChecked++
  const faces = revetmentFaces(doc)
  let wet = 0, dry = 0, unreadable = 0
  const worst = []
  for (const f of faces) {
    if (!f.anyArmour) continue
    const p = f.poly
    for (let i = 1; i < p.length - 1; i++) {
      if (!f.stations[i].armour) continue
      const ux = p[i + 1].x - p[i - 1].x, uz = p[i + 1].z - p[i - 1].z
      const m = Math.hypot(ux, uz); if (!m) continue
      // ⭐ The BUILD normal, copied from revetmentDrape.js: n = (uz, −ux). Whatever
      // BUILD_SIDE says, the geometry extrudes this way; that is what we audit.
      const nx = uz / m, nz = -ux / m
      const wBuild = inWater(p[i].x + nx * probeM, p[i].z + nz * probeM)
      const wBack = inWater(p[i].x - nx * probeM, p[i].z - nz * probeM)
      // Water on both faces (a breakwater) or neither (a street end) says nothing about
      // orientation; only a station with water on exactly one side can be built backwards.
      if (wBuild === wBack) { unreadable++; continue }
      if (wBuild) wet++
      else { dry++; if (worst.length < 3) worst.push(`${f.key} @ ${p[i].x.toFixed(0)},${p[i].z.toFixed(0)}: drawn water is BEHIND the build side`) }
    }
  }
  const total = wet + dry
  const pct = total ? (100 * wet) / total : 0
  // ⭐ Not 100%: a harbour corner can put water behind a station for a step or two. The
  // threshold separates "a coast with awkward corners" from "built inside out", a landslide.
  const ok = total > 0 && pct >= 90
  console.log(`  ${ok ? '✅' : '⛔'} ${look}/revetment  ${wet}/${total} armoured stations build toward the DRAWN WATER (${pct.toFixed(1)}%) · ${unreadable} with water on both faces or neither · BUILD_SIDE=${BUILD_SIDE}`)
  for (const w of worst) console.log(`       ${w}`)
  if (!ok) failed = true
}

console.log(`\n  ${townsChecked} revetment(s) audited · ${townsWithout} town(s) without one`)
console.log(`  probe = the heightfield's own step · "faces the water" = the build side is inside the drawn water and the back is not`)
if (failed) { console.log('\n⛔ stone is being built toward the DRY side — the revetment would render inside out'); process.exit(1) }
console.log('\n✅ every armoured station builds toward its water')
