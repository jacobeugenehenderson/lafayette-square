// claims-the-shore-knows-which-side-is-wet.mjs — WHICH FACE DOES THE STONE GO ON?
//
// ⭐⭐ THE INVARIANT: every shoreline arc long enough to carry a revetment resolves,
// FROM THE DRAWN WATER, to a definite wet side — and every arc that does not is REFUSED
// BY NAME rather than quietly given one.
// ⭐ Ruled 2026-09-26 (Jacob): "The drawn water's edge IS the mapped shoreline, and the
// revetment sits on it." Until then this asked the lidar (`r-coast-trust-the-lidar`).
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
// defined by winding at all. ⇒ Ask the drawn water. That is `wetSideOf`.
//
// ⛔ THIS CHECK ALLOWS DISAGREEMENT BETWEEN ARCS. What it does not allow is a
// build-worthy arc with NO drawn water beside it (`ink-without-water`): the slab's
// shoreline ink and the drawing disagree, and stone would be placed on a guess.
//
//   node checks/claims-the-shore-knows-which-side-is-wet.mjs        # every baked town
//   node checks/claims-the-shore-knows-which-side-is-wet.mjs huron  # just that one
// Read-only. Exits 1 if a build-worthy arc cannot say which side its water is on.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { wetSideOf, drawnWaterTest } from '../cartograph/shore-armour.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const WATER_EDGE_SKEL = '__water__'

// ⛔⛔ SELF-TEST FIRST — a side-picker that always answers looks exactly like a
// correct one, and the refusals are the half that matters.
{
  const straight = Array.from({ length: 40 }, (_, i) => [i * 5, 0])   // 195 m, +x
  // water to the RIGHT of +x walk is +z (south) in this frame
  const lake = (z0, z1) => drawnWaterTest([[[-50, z0], [300, z0], [300, z1], [-50, z1]]])
  const cases = [
    ['water right of the walk', wetSideOf(straight, lake(0.001, 500), 5), 'right'],
    ['water left of the walk', wetSideOf(straight, lake(-500, -0.001), 5), 'left'],
    ['water on both sides (a breakwater)', wetSideOf(straight, drawnWaterTest([[[-50, 1], [300, 1], [300, 500], [-50, 500]], [[-50, -500], [300, -500], [300, -1], [-50, -1]]]), 5), 'both'],
    ['no drawn water at all', wetSideOf(straight, () => false, 5), null],
    ['a stub', wetSideOf([[0, 0], [1, 0], [2, 0]], lake(0.001, 500), 5), null],
  ]
  for (const [what, got, want] of cases) {
    if (got.side !== want) {
      console.error(`⛔ SELF-TEST FAILED — "${what}" gave ${got.side}, expected ${want}. (${got.why})`)
      console.error('   The side-picker is broken, so its verdict on the towns below means nothing.')
      process.exit(2)
    }
  }
  // ⛔ A heightfield passed where the drawn water belongs must THROW, not answer.
  let threw = false
  try { wetSideOf(straight, () => 0.3, 5) } catch { threw = true }
  if (!threw) { console.error('⛔ SELF-TEST FAILED — a heightfield was accepted as the drawn water.'); process.exit(2) }
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

  const tPath = `cartograph/data/${scene}/clean/terrain.json`
  const mPath = `cartograph/data/${scene}/clean/map.json`
  if (!existsSync(join(ROOT, tPath)) || !existsSync(join(ROOT, mPath))) { fail.push(`   ${scene}: shoreline but no ${!existsSync(join(ROOT, tPath)) ? 'terrain' : 'map.json'} — cannot rule.`); continue }
  const tm = JSON.parse(read(tPath))
  const gridM = Math.min((tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1), (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1))
  const rings = (JSON.parse(read(mPath)).layers?.water || []).filter(w => w?.ring?.length >= 3).map(w => w.ring.map(p => [p.x ?? p[0], p.z ?? p[1]]))
  if (!rings.length) { fail.push(`   ${scene}: shoreline ink in the slab but NO drawn water in map.json — the ink and the drawing disagree.`); continue }
  const inWater = drawnWaterTest(rings)

  shores++
  const tally = { left: 0, right: 0, both: 0, refused: 0 }
  const refusals = []
  let buildable = 0
  for (const r of arcs) {
    let len = 0
    for (let i = 1; i < r.poly.length; i++) len += Math.hypot(r.poly[i][0] - r.poly[i - 1][0], r.poly[i][1] - r.poly[i - 1][1])
    const w = wetSideOf(r.poly, inWater, gridM)
    if (w.side) {
      tally[w.side]++; buildable++
      if (w.side === 'both') twoWater.push(`${scene}: ${len.toFixed(0)} m — ${w.why}`)
    }
    else {
      tally.refused++
      refusals.push({ len, why: w.why })
      // ⛔ A stub is refused by name and is fine; shoreline ink with no drawn water is not.
      if (w.kind === 'ink-without-water') fail.push(`   ${scene}: a ${len.toFixed(0)} m arc cannot say which side its water is on — ${w.why}`)
    }
  }
  const mixed = tally.left > 0 && tally.right > 0
  console.log(`\n  ${scene} — ${arcs.length} arcs · LEFT ${tally.left} · RIGHT ${tally.right} · BOTH ${tally.both} · refused ${tally.refused}`)
  if (mixed) console.log(`     ⭐ THE ARCS DISAGREE, and that is the measured truth — a per-town flip would be wrong on ${Math.min(tally.left, tally.right)} of them.`)
  for (const r of refusals.slice(0, 4)) console.log(`     refused: ${r.len.toFixed(0)} m — ${r.why}`)
  if (refusals.length > 4) console.log(`     … and ${refusals.length - 4} more refusals`)
  console.log(`     ⇒ ${buildable} arc(s) can carry stone; ${tally.refused} must be refused by name, never guessed`)
}

console.log(`\n  ${shores} shoreline(s) · ${dry} town(s) without one`)
if (twoWater.length) {
  console.log(`\n  ⭐ ${twoWater.length} arc(s) have WATER ON BOTH SIDES — two faces, both offered to the predicate:`)
  for (const t of twoWater) console.log(`     ${t}`)
  console.log(`     ▶ RULED 2026-09-21: 'both' is an answer, not a refusal. A breakwater is armoured on`)
  console.log(`       two faces and a sand bar on neither — and \`shoreArmourFor\` already knows which.`)
}
if (fail.length) {
  console.error(`\n⛔ A BUILD-WORTHY ARC DOES NOT KNOW WHICH SIDE ITS WATER IS ON:\n${fail.join('\n')}`)
  console.error(`\n   ⚠️ Stone placed on such an arc is a coin flip, and the wrong face is invisible`)
  console.error(`      from every angle except the waterline.`)
  process.exit(1)
}
console.log('\n✅ every arc long enough to carry stone knows which side its water is on')
