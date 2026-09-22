// claims-a-level-body-has-one-surface.mjs — IS THE LAKE FLAT IN OUR OWN HEIGHTFIELD?
//
// ⭐⭐ THE INVARIANT, in one sentence, and it needs no threshold anybody chose:
//
//     A water body is a LEVEL surface. So the heightfield beneath it must be ONE
//     surface, and the water mesh we draw must sit ON that surface.
//
// ⛔ THIS DEFECT LOOKS LIKE SCENERY, WHICH IS WHY IT NEEDS A CHECK. When the two
// disagree the land does not vanish and nothing errors — the ground simply stands
// some distance proud of the water it is supposed to meet, and reads as a bank, a
// bluff, or (Jacob, 2026-09-21, looking at huron) "gashes in the seam". It is the
// `CLAUDE.md` gate's one protected case: a WRONG element that looks PLAUSIBLE.
// ⚠️ And it is worth more than its own bug: a revetment, a beach, a dock or a
// waterline shader placed against a shore that is 1 m out inherits the error and
// makes it permanent — as stone, which nobody will later read as a datum fault.
//
// ⛔⛔ WHAT MAKES IT INVISIBLE: `bake-terrain.js` normalizes the heightfield to
// local-min = 0, and `BakedGround.jsx` reasons that "on a lakeshore town the local
// minimum IS the lake". That is an ASSUMPTION about the source, not a property of
// it. If the DEM mosaic carries the body hydro-flattened at more than one value —
// tiles flown at different lake levels, a dredged channel, a nodata patch — the
// global minimum lands on the wrong one and the whole body is drawn low. Nothing
// downstream can tell.
//
// ⭐ THE TOLERANCE IS DERIVED, NOT PICKED. Ground groups are separated in Y by
// `renderOrder × GROUND_Y_EPS` (`bake-ground.js`), so the entire coplanar stack is
// worth (group count × EPS) metres. Anything inside that is the resolver; anything
// beyond it is a real disagreement. Both numbers are READ from the artifacts — a
// second copy is how the first vocabulary drifted (`CLAUDE.md`).
//
// ⛔ A TOWN WITH NO WATER IS NOT A PASS AND NOT A FAILURE — it prints "no water
// body" and is counted separately. Silence about an absent thing is the silent
// substitution this corpus exists to prevent.
//
//   node checks/claims-a-level-body-has-one-surface.mjs          # every baked town
//   node checks/claims-a-level-body-has-one-surface.mjs huron    # just that one
// Read-only. Exits 1 when a body's bed is not one surface, or the mesh is off it.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** GROUND_Y_EPS, parsed out of the bake rather than restated here. */
function groundYEps() {
  const m = read('cartograph/bake-ground.js').match(/const GROUND_Y_EPS\s*=\s*([\d.]+)/)
  if (!m) throw new Error('⛔ could not parse GROUND_Y_EPS from cartograph/bake-ground.js — the tolerance is unknown, so a PASS would mean nothing. Fix the parse first.')
  return Number(m[1])
}

/** The scene's terrain heightfield, as a sampler in local metres. */
function terrainOf(scene) {
  const metaRel = `cartograph/data/${scene}/clean/terrain.json`
  const binRel = `cartograph/data/${scene}/clean/terrain.bin`
  if (!existsSync(join(ROOT, metaRel)) || !existsSync(join(ROOT, binRel))) return null
  const meta = JSON.parse(read(metaRel))
  const buf = readFileSync(join(ROOT, binRel))
  const h = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
  const stepX = (meta.bounds.maxX - meta.bounds.minX) / (meta.width - 1)
  const stepZ = (meta.bounds.maxZ - meta.bounds.minZ) / (meta.height - 1)
  return (x, z) => {
    const gx = Math.round((x - meta.bounds.minX) / stepX)
    const gz = Math.round((z - meta.bounds.minZ) / stepZ)
    if (gx < 0 || gz < 0 || gx >= meta.width || gz >= meta.height) return NaN
    const v = h[gz * meta.width + gx]
    return Number.isFinite(v) ? v : NaN
  }
}

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

/** The two predicates, isolated so they can be exercised against known inputs. */
// ⭐ `lift` is the group's OWN coplanar offset (renderOrder × GROUND_Y_EPS), which
// the bake puts there deliberately. ⛔ Subtract it rather than let the tolerance
// absorb it: a known, computable offset is not measurement slack, and folding it
// into the slack costs exactly the resolution this check needs. (huron's lake sits
// in slot 34 of 35, so its mesh is 0.068 m up by construction — against a whole-
// stack tolerance of 0.070 that left 2 mm of real headroom, and the check failed
// a correct bake by ONE MILLIMETRE.)
const verdict = (bed, meshY, stack, lift = 0) => {
  const s = bed.slice().sort((m, n) => m - n)
  const med = quantile(s, 0.5), iqr = quantile(s, 0.75) - quantile(s, 0.25)
  return { med, iqr, flat: iqr <= stack, seated: Math.abs(med - (meshY - lift)) <= stack }
}

// ⛔⛔ MUTATION TEST, RUN EVERY TIME — not a one-off someone did once and wrote down.
// Today huron is the only town in the kit with water in its slab, and it FAILS. So
// nothing in the corpus can demonstrate this check going green, and a check that has
// only ever been seen red is indistinguishable from one that is stuck red.
// `CLAUDE.md`: a passing check proves nothing until it has been seen to FAIL — and the
// converse holds too. Three synthetic bodies, asserted before any town is touched.
{
  const stack = 0.07
  const level = Array.from({ length: 500 }, () => 1.4 + (Math.random() - 0.5) * 0.01)
  const split = [...Array.from({ length: 250 }, () => 0.03), ...Array.from({ length: 250 }, () => 1.2)]
  const cases = [
    ['a level bed, mesh seated on it', verdict(level, 1.4, stack), true, true],
    ['a level bed, mesh 1 m under it', verdict(level, 0.4, stack), true, false],
    ['a bed at two elevations', verdict(split, 0.03, stack), false, false],
    ['a level bed under a mesh lifted by its own coplanar offset', verdict(level, 1.4 + 0.068, stack, 0.068), true, true],
  ]
  for (const [what, v, wantFlat, wantSeated] of cases) {
    if (v.flat !== wantFlat || v.seated !== wantSeated) {
      console.error(`⛔ SELF-TEST FAILED — "${what}" gave flat=${v.flat} seated=${v.seated}, expected ${wantFlat}/${wantSeated}.`)
      console.error('   The instrument is broken, so its verdict on the towns below means nothing.')
      process.exit(2)
    }
  }
}

const list = scenes('public/baked/<scene>/ground.json', { label: 'baked ground' })
const EPS = groundYEps()
const fail = []
let bodies = 0, dry = 0

for (const scene of list) {
  const gj = JSON.parse(read(`public/baked/${scene}/ground.json`))
  const water = gj.groups.filter(g => /^water(:|$)/.test(g.id))
  if (!water.length) { console.log(`  ${scene.padEnd(18)} no water body in the slab — nothing to level`); dry++; continue }
  const sample = terrainOf(scene)
  if (!sample) { console.log(`  ${scene.padEnd(18)} ⚠️  water body but NO terrain artifact — not checked`); continue }

  // The whole coplanar stack is worth this much Y. Inside it, a difference is the
  // resolver doing its job; outside it, the two surfaces genuinely disagree.
  const STACK = gj.groups.length * EPS
  const bin = readFileSync(join(ROOT, `public/baked/${scene}/ground.bin`))

  for (const wg of water) {
    bodies++
    const pos = new Float32Array(bin.buffer, bin.byteOffset + wg.vertexByteOffset, wg.vertexCount * 3)
    const idx = new Uint32Array(bin.buffer, bin.byteOffset + wg.indexByteOffset, wg.indexCount)
    const meshY = pos[1]

    // ⛔⛔ SAMPLES ARE ALLOCATED BY AREA, AND THE FIRST VERSION OF THIS CHECK WAS NOT.
    // It drew a fixed 24 samples PER TRIANGLE and its comment claimed that was
    // area-weighted. It is not, and on a real body it is badly wrong: huron's lake
    // is 657 triangles spanning 99 m² to 2.6 km², so hundreds of shoreline slivers
    // outvoted the open water and the verdict described the SHORE while claiming to
    // describe the BODY. ⭐ Caught 2026-09-21 by a peer's independent count of the
    // artifact disagreeing with this check — the instrument was the defect, which is
    // the commonest place for one to be.
    const tris = []
    let area = 0
    for (let t = 0; t < idx.length; t += 3) {
      const P = [0, 1, 2].map(k => [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 2]])
      const A = Math.abs((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1])) / 2
      if (!(A > 0)) continue
      tris.push({ P, A }); area += A
    }
    const BUDGET = 40000
    const bed = []
    for (const { P, A } of tris) {
      const n = Math.max(1, Math.round(BUDGET * A / area))
      for (let s = 0; s < n; s++) {
        // deterministic low-discrepancy pair — same bed every run, no seed to drift
        let a = ((s + 1) * 0.7548776662) % 1, b = ((s + 1) * 0.5698402909) % 1
        if (a + b > 1) { a = 1 - a; b = 1 - b }
        const x = P[0][0] + a * (P[1][0] - P[0][0]) + b * (P[2][0] - P[0][0])
        const z = P[0][1] + a * (P[1][1] - P[0][1]) + b * (P[2][1] - P[0][1])
        const v = sample(x, z)
        if (Number.isFinite(v)) bed.push(v)
      }
    }
    if (bed.length < 100) { console.log(`  ${scene}/${wg.id}: only ${bed.length} bed samples — not checked`); continue }
    const LIFT = (wg.renderOrder || 0) * EPS
    const { med, iqr, flat, seated } = verdict(bed, meshY, STACK, LIFT)
    const off = med - (meshY - LIFT)
    const proud = bed.filter(v => v - (meshY - LIFT) > STACK).length / bed.length
    const mark = flat && seated ? '✅' : '⛔'
    console.log(`  ${mark} ${scene}/${wg.id}  bed median ${med.toFixed(3)} m · IQR ${iqr.toFixed(3)} m · mesh Y ${meshY.toFixed(3)} m · stack ${STACK.toFixed(3)} m · ${(area/1e6).toFixed(2)} km², ${bed.length.toLocaleString()} area-weighted samples`)
    if (!flat) {
      fail.push(`   ${scene}/${wg.id}: the bed beneath a LEVEL body spreads ${iqr.toFixed(2)} m (IQR), ${(iqr / STACK).toFixed(0)}× the coplanar stack.`)
      fail.push(`     A level surface has ONE bed elevation. More than one means the source carries this body`)
      fail.push(`     hydro-flattened at several values, and normalizing to local-min picks one arbitrarily.`)
    }
    if (!seated) {
      fail.push(`   ${scene}/${wg.id}: the water mesh is drawn ${off > 0 ? 'BELOW' : 'ABOVE'} its own bed by ${Math.abs(off).toFixed(2)} m.`)
      fail.push(`     ${(100 * proud).toFixed(1)}% of the body's area has ground standing proud of the water it should meet.`)
      // ⭐ The two directions are NOT equally urgent and the report must say so, or
      // this reads as one defect with a sign. Ground above water is the one you SEE.
      fail.push(off > 0
        ? `     ⛔ BELOW is the VISIBLE failure: ground pokes through the surface and reads as a bank.`
        : `     ⚠️ ABOVE is INVISIBLE from the camera (you cannot see under water) but still means the`
          + `\n        source and the mesh disagree — shore geometry fitted here still inherits the offset.`)
    }
  }
}

console.log(`\n  ${bodies} water bod${bodies === 1 ? 'y' : 'ies'} checked · ${dry} town${dry === 1 ? '' : 's'} with none · tolerance = the coplanar stack (GROUND_Y_EPS ${EPS} m, read from bake-ground.js)`)
if (fail.length) {
  console.error(`\n⛔ A LEVEL BODY DOES NOT HAVE ONE SURFACE:\n${fail.join('\n')}`)
  console.error(`\n   ⚠️ Do not place shore geometry — revetment, dock, beach, waterline band — against a shore`)
  console.error(`      that fails this. It inherits the offset and makes it permanent.`)
  process.exit(1)
}
console.log('\n✅ every water body is one surface, and its mesh sits on it')
