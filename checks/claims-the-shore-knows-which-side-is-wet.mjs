// claims-the-shore-knows-which-side-is-wet.mjs — WHICH FACE DOES THE STONE GO ON?
//
// ⭐⭐ THE INVARIANT: every shoreline arc long enough to carry a revetment resolves,
// FROM THE GROUND, to a definite wet side — and every arc that does not is REFUSED
// BY NAME rather than quietly given one.
//
// ⛔ WHY THIS IS NOT A STYLE QUESTION. A revetment is built on ONE face of its arc.
// Get it backwards and the wetted band paints inland, the slope leans the wrong
// way, and the drape's normals point down — correct geometry, correct position,
// and wrong. ⚠️ It is invisible in every oblique view and shows only from a camera
// at the waterline, which is the failure this kit rates worst: plausible.
//
// ⛔⛔ AND IT EXISTS BECAUSE A CONVENTION WAS ASSERTED AND MEASURED FALSE WITHIN
// HOURS. `shore-armour.mjs` said "the walk direction IS the wet side". huron's own
// arcs disagree with each other — ⛔ run this rather than quoting a split here; the
// first version of this comment already went stale when the probe changed. A
// per-town flip is wrong on a real arc, and the run's own `side` stamp does not
// predict it either — arcs stamped `left` sit in both camps.
// An arc is OPEN ink, not a ring, so it has no orientation to inherit; and a bank
// between a river and a lake has water on BOTH sides, where the question is not
// defined by winding at all. ⇒ Ask the ground. That is `wetSideOf`.
//
// ⛔ THIS CHECK ALLOWS DISAGREEMENT BETWEEN ARCS — that is the measured truth, not
// a defect. What it does not allow is an arc that resolves to NOTHING while still
// being long enough to build on, because that is where stone would be placed on a
// guess.
//
//   node checks/claims-the-shore-knows-which-side-is-wet.mjs        # every baked town
//   node checks/claims-the-shore-knows-which-side-is-wet.mjs huron  # just that one
// Read-only. Exits 1 if a build-worthy arc cannot say which side its water is on.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { wetSideOf } from '../cartograph/shore-armour.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const WATER_EDGE_SKEL = '__water__'

// ⛔⛔ SELF-TEST FIRST — a side-picker that always answers looks exactly like a
// correct one, and the refusals are the half that matters.
{
  const flat = () => 0
  const straight = Array.from({ length: 40 }, (_, i) => [i * 5, 0])   // 195 m, +x
  // water to the RIGHT of +x walk is +z (south) in this frame
  const rightWet = (x, z) => (z > 0 ? -1 : 2)
  const leftWet = (x, z) => (z > 0 ? 2 : -1)
  const cases = [
    ['water right of the walk', wetSideOf(straight, rightWet), 'right'],
    ['water left of the walk', wetSideOf(straight, leftWet), 'left'],
    ['both sides identical', wetSideOf(straight, flat), null],
    ['a stub', wetSideOf([[0, 0], [1, 0], [2, 0]], rightWet), null],
    ['no terrain', wetSideOf(straight, () => NaN), null],
  ]
  for (const [what, got, want] of cases) {
    if (got.side !== want) {
      console.error(`⛔ SELF-TEST FAILED — "${what}" gave ${got.side}, expected ${want}. (${got.why})`)
      console.error('   The side-picker is broken, so its verdict on the towns below means nothing.')
      process.exit(2)
    }
  }
}

const list = scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
const fail = []
const twoWater = []
let shores = 0, dry = 0

for (const scene of list) {
  const shape = JSON.parse(read(`public/baked/${scene}/shape.json`))
  const seen = new Set(); const arcs = []
  for (const t of (shape.tiles || [])) for (const r of (t.runs || [])) {
    if (r.skelId !== WATER_EDGE_SKEL || !Array.isArray(r.poly) || r.poly.length < 2) continue
    const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
    if (!seen.has(k)) { seen.add(k); arcs.push(r) }
  }
  if (!arcs.length) { console.log(`  ${scene.padEnd(18)} no shoreline — nothing to orient`); dry++; continue }

  const gj = JSON.parse(read(`public/baked/${scene}/ground.json`))
  const wg = gj.groups.find(g => /^water(:|$)/.test(g.id))
  const gb = readFileSync(join(ROOT, `public/baked/${scene}/ground.bin`))
  const eps = Number((read('cartograph/bake-ground.js').match(/const GROUND_Y_EPS\s*=\s*([\d.]+)/) || [])[1])
  const meshY = wg ? new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1] : 0
  const waterY = meshY - (wg?.renderOrder || 0) * eps
  const tPath = `cartograph/data/${scene}/clean/terrain.json`
  if (!existsSync(join(ROOT, tPath))) { fail.push(`   ${scene}: shoreline but no terrain — cannot ask the ground.`); continue }
  const tm = JSON.parse(read(tPath))
  const tb = readFileSync(join(ROOT, `cartograph/data/${scene}/clean/terrain.bin`))
  const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
  const sx = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
  const sz = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
  const heightAt = (x, z) => {
    const gx = Math.round((x - tm.bounds.minX) / sx), gz = Math.round((z - tm.bounds.minZ) / sz)
    if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
    const v = tf[gz * tm.width + gx]
    return Number.isFinite(v) ? v - waterY : NaN
  }

  shores++
  const tally = { left: 0, right: 0, refused: 0 }
  const refusals = []
  let buildable = 0
  for (const r of arcs) {
    let len = 0
    for (let i = 1; i < r.poly.length; i++) len += Math.hypot(r.poly[i][0] - r.poly[i - 1][0], r.poly[i][1] - r.poly[i - 1][1])
    const w = wetSideOf(r.poly, heightAt)
    if (w.side) { tally[w.side]++; buildable++ }
    else {
      tally.refused++
      refusals.push({ len, why: w.why })
      // ⛔⛔ TWO DIFFERENT REFUSALS, AND ONLY ONE IS A FAILURE. Conflating them made
      // this check red on a correct reading, which is the instrument lying in the
      // other direction.
      //   · "water on BOTH sides" is a REAL FEATURE, correctly identified — a pier,
      //     a jetty, a bank between a river and a lake. It has no single wet face
      //     and refusing it is the right answer. It wants a ruling (stone on both
      //     faces, or none), not a fix.
      //   · "neither side reaches the water" on a long arc means we do not
      //     understand this arc. THAT is the failure.
      if (len >= 100 && !/BOTH sides/.test(w.why)) {
        fail.push(`   ${scene}: a ${len.toFixed(0)} m arc cannot say which side its water is on — ${w.why}`)
      } else if (len >= 100) {
        twoWater.push(`${scene}: ${len.toFixed(0)} m — ${w.why}`)
      }
    }
  }
  const mixed = tally.left > 0 && tally.right > 0
  console.log(`\n  ${scene} — ${arcs.length} arcs · water LEFT of walk ${tally.left} · RIGHT ${tally.right} · refused ${tally.refused}`)
  if (mixed) console.log(`     ⭐ THE ARCS DISAGREE, and that is the measured truth — a per-town flip would be wrong on ${Math.min(tally.left, tally.right)} of them.`)
  for (const r of refusals.slice(0, 4)) console.log(`     refused: ${r.len.toFixed(0)} m — ${r.why}`)
  if (refusals.length > 4) console.log(`     … and ${refusals.length - 4} more refusals`)
  console.log(`     ⇒ ${buildable} arc(s) can carry stone; ${tally.refused} must be refused by name, never guessed`)
}

console.log(`\n  ${shores} shoreline(s) · ${dry} town(s) without one`)
if (twoWater.length) {
  console.log(`\n  ⭐ ${twoWater.length} arc(s) have WATER ON BOTH SIDES — correctly identified, not a defect:`)
  for (const t of twoWater) console.log(`     ${t}`)
  console.log(`     ▶ These are piers, jetties or banks between two waters. They have no single wet face.`)
  console.log(`       ⛔ UNRULED: does such an arc get stone on both faces, or none? Nobody has decided.`)
}
if (fail.length) {
  console.error(`\n⛔ A BUILD-WORTHY ARC DOES NOT KNOW WHICH SIDE ITS WATER IS ON:\n${fail.join('\n')}`)
  console.error(`\n   ⚠️ Stone placed on such an arc is a coin flip, and the wrong face is invisible`)
  console.error(`      from every angle except the waterline.`)
  process.exit(1)
}
console.log('\n✅ every arc long enough to carry stone knows which side its water is on')
