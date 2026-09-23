// claims-the-revetment-builds-on-the-wet-face.mjs — DOES THE STONE FACE THE WATER?
//
// ⭐⭐ THE INVARIANT: for every armoured station the player will build on, the side
// the BUILDERS extrude toward is the side the GROUND says is water.
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

  // The heightfield the bake itself read, so "wet" means here what it meant there.
  const scene = doc.scene || look
  const tMeta = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json')
  const tBin = join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.bin')
  if (!existsSync(tMeta) || !existsSync(tBin)) {
    // ⛔ Not a pass. The artifact exists and claims faces; we simply cannot audit it.
    console.log(`  ⚠️ ${look.padEnd(16)} revetment.json present but scene "${scene}" has no clean/terrain — CANNOT VERIFY`)
    failed = true; continue
  }
  const tm = JSON.parse(readFileSync(tMeta, 'utf8'))
  const tb = readFileSync(tBin)
  const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
  const stepX = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
  const stepZ = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
  const probeM = Math.min(stepX, stepZ)
  const heightAt = (x, z) => {
    const gx = Math.round((x - tm.bounds.minX) / stepX), gz = Math.round((z - tm.bounds.minZ) / stepZ)
    if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
    const v = tf[gz * tm.width + gx]
    return Number.isFinite(v) ? v : NaN
  }

  townsChecked++
  const faces = revetmentFaces(doc)
  let wet = 0, dry = 0, unreadable = 0
  const margins = []
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
      const hBuild = heightAt(p[i].x + nx * probeM, p[i].z + nz * probeM)
      const hBack = heightAt(p[i].x - nx * probeM, p[i].z - nz * probeM)
      if (!Number.isFinite(hBuild) || !Number.isFinite(hBack)) { unreadable++; continue }
      // ⛔⛔ ORIENTATION IS A RELATIVE QUESTION AND THE FIRST CUT OF THIS CHECK GOT
      // IT WRONG. It demanded `hBuild <= MIN_ARMOUR_D50_M` as well, and failed
      // stations reading 0.54 m on the build side against 1.98 m landward — which
      // is emphatically the waterward side, just past an absolute cutoff. The probe
      // stands one grid step off the line, where a real bank has already begun to
      // rise, so an absolute threshold measures the PROBE DISTANCE as much as the
      // shore. ⭐ Whether the shore is at the water is `wetSideOf`'s question and is
      // checked next door; the question HERE is only whether we build toward the
      // lower side. Keep them apart or each one hides the other.
      if (hBuild < hBack) { wet++; margins.push(hBack - hBuild) }
      else { dry++; if (worst.length < 3) worst.push(`${f.key} @ ${p[i].x.toFixed(0)},${p[i].z.toFixed(0)}: build side ${hBuild.toFixed(2)} m vs back ${hBack.toFixed(2)} m`) }
    }
  }
  const total = wet + dry
  const pct = total ? (100 * wet) / total : 0
  // ⭐ Not 100%: a real shore has river mouths, harbour corners and spits where the
  // grid genuinely reads both sides near zero. The threshold is what separates
  // "a coast with awkward corners" from "built inside out", which is a landslide.
  const ok = total > 0 && pct >= 90
  margins.sort((a, b) => a - b)
  const med = margins.length ? margins[margins.length >> 1] : 0
  console.log(`  ${ok ? '✅' : '⛔'} ${look}/revetment  ${wet}/${total} armoured stations build toward the LOWER side (${pct.toFixed(1)}%) · median drop ${med.toFixed(2)} m · ${unreadable} off-grid · BUILD_SIDE=${BUILD_SIDE}`)
  for (const w of worst) console.log(`       ${w}`)
  if (!ok) failed = true
}

console.log(`\n  ${townsChecked} revetment(s) audited · ${townsWithout} town(s) without one`)
console.log(`  probe = the heightfield's own step · "faces the water" = the build side reads LOWER than the landward side`)
if (failed) { console.log('\n⛔ stone is being built toward the DRY side — the revetment would render inside out'); process.exit(1) }
console.log('\n✅ every armoured station builds toward its water')
