// claims-the-shore-says-what-it-is-made-of.mjs — CAN THE KIT TELL STONE FROM SAND?
//
// ⭐⭐ THE INVARIANT: every vertex of a town's shoreline resolves to a NAMED verdict
// — armoured or not — with a reason, from data already on disk. No authored value,
// no per-town table, no skip list. ⛔ A vertex that resolves to nothing is the
// failure, because a procedural revetment would silently place nothing there and
// the operator would see a plausible, wrong coast.
//
// ⛔ WHY THIS IS A CHECK AND NOT A COMMENT. `BRIEF-boulder-revetment` has to decide
// where stone goes before any stone exists, and the decision is derived from LU +
// OSM + the heightfield. All three drift: a tag gets re-bucketed, a land use gains
// a subtype, a datum moves. This is what notices.
//
// ⭐ AND IT REPORTS THE DISPUTES, which are the part worth a person's time: a
// tagged seawall where the ground is flat, or a mapped beach with a wall behind
// it. One of the two sources is wrong there. ⛔ They are NOT failures — the
// predicate still answers, by the ordered rule — but an unreported dispute is the
// map lying quietly, so the count is printed and a sharp rise in it is a signal.
//
// ⛔ A TOWN WITH NO SHORELINE IS NOT A PASS AND NOT A FAILURE — it says so and is
// counted separately. Silence about an absent thing is the substitution this
// corpus exists to prevent.
//
//   node checks/claims-the-shore-says-what-it-is-made-of.mjs         # every baked town
//   node checks/claims-the-shore-says-what-it-is-made-of.mjs huron   # just that one
// Read-only. Exits 1 if any shoreline vertex fails to resolve.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { shoreArmourFor, MIN_ARMOUR_D50_M, RIPRAP_REPOSE_DEG, TAG_REACH_M } from '../cartograph/shore-armour.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const WATER_EDGE_SKEL = '__water__'   // tileGround.js's own id for the stroked coast

// ⛔⛔ SELF-TEST FIRST. The ordered rule is the whole design, and an ordering bug
// looks exactly like a correct run — every vertex still resolves, just wrongly.
// Three synthetic shores, asserted before any town is read.
{
  const way = (tags, pts) => ({ tags, isClosed: pts.length > 2, coords: pts.map(([x, z]) => ({ x, z })) })
  const ground = {
    barrier: [way({ barrier: 'retaining_wall' }, [[0, 0], [100, 0]])],
    natural: [way({ natural: 'beach' }, [[200, 0], [300, 0]])],
    leisure: [way({ leisure: 'park' }, [[-10, -50], [110, -50], [110, 50], [-10, 50]])],
  }
  const at = shoreArmourFor(ground)
  const cases = [
    ['a seawall inside a park is still a seawall', at(50, 0, 1.5), true, 'structure-tag'],
    ['a beach is not armoured however tall', at(250, 0, 3.0), false, 'soft-shore'],
    ['unmapped shore, a wall of ground', at(600, 600, 1.2), true, 'height'],
    ['unmapped shore, barely a step', at(600, 600, 0.1), false, 'below-one-course'],
  ]
  for (const [what, got, wantArmour, wantWhy] of cases) {
    if (got.armour !== wantArmour || got.why !== wantWhy) {
      console.error(`⛔ SELF-TEST FAILED — "${what}" gave ${got.armour}/${got.why}, expected ${wantArmour}/${wantWhy}.`)
      console.error('   The predicate is broken, so its verdict on the towns below means nothing.')
      process.exit(2)
    }
  }
  if (!at(50, 0, 0.05).dispute) {
    console.error('⛔ SELF-TEST FAILED — a tagged wall on flat ground did not raise a dispute.')
    process.exit(2)
  }
}

const list = scenes('public/baked/<scene>/shape.json', { label: 'baked shape' })
const fail = []
let shores = 0, dry = 0

for (const scene of list) {
  const shape = JSON.parse(read(`public/baked/${scene}/shape.json`))
  const seen = new Set(); const arcs = []
  for (const t of (shape.tiles || [])) for (const r of (t.runs || [])) {
    if (r.skelId !== WATER_EDGE_SKEL || !Array.isArray(r.poly)) continue
    const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
    if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
  }
  if (!arcs.length) { console.log(`  ${scene.padEnd(18)} no shoreline in the slab — nothing to classify`); dry++; continue }

  const osmPath = `cartograph/data/${scene}/raw/osm.json`
  if (!existsSync(join(ROOT, osmPath))) {
    fail.push(`   ${scene}: has a shoreline but no ${osmPath} — the predicate cannot be asked.`)
    continue
  }
  const ground = JSON.parse(read(osmPath)).ground || {}

  // the water plane and the heightfield, as the slab carries them
  const gj = JSON.parse(read(`public/baked/${scene}/ground.json`))
  const wg = gj.groups.find(g => /^water(:|$)/.test(g.id))
  const gb = readFileSync(join(ROOT, `public/baked/${scene}/ground.bin`))
  const meshY = wg ? new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1] : 0
  const epsM = (read('cartograph/bake-ground.js').match(/const GROUND_Y_EPS\s*=\s*([\d.]+)/) || [])[1]
  const lift = wg && epsM ? (wg.renderOrder || 0) * Number(epsM) : 0
  const tmeta = JSON.parse(read(`cartograph/data/${scene}/clean/terrain.json`))
  const tbuf = readFileSync(join(ROOT, `cartograph/data/${scene}/clean/terrain.bin`))
  const tf = new Float32Array(tbuf.buffer, tbuf.byteOffset, tbuf.length / 4)
  const sx = (tmeta.bounds.maxX - tmeta.bounds.minX) / (tmeta.width - 1)
  const sz = (tmeta.bounds.maxZ - tmeta.bounds.minZ) / (tmeta.height - 1)
  const heightAt = (x, z) => {
    const gx = Math.round((x - tmeta.bounds.minX) / sx), gz = Math.round((z - tmeta.bounds.minZ) / sz)
    if (gx < 0 || gz < 0 || gx >= tmeta.width || gz >= tmeta.height) return NaN
    const v = tf[gz * tmeta.width + gx]
    return Number.isFinite(v) ? v - (meshY - lift) : NaN
  }

  const armourAt = shoreArmourFor(ground)
  const tally = {}, disputes = []
  let n = 0, unresolved = 0
  for (const poly of arcs) for (const [x, z] of poly) {
    const r = armourAt(x, z, heightAt(x, z))
    n++
    if (typeof r?.armour !== 'boolean' || !r.why) { unresolved++; continue }
    tally[`${r.armour ? 'ARMOUR  ' : 'bare    '} ${r.why}`] = (tally[`${r.armour ? 'ARMOUR  ' : 'bare    '} ${r.why}`] || 0) + 1
    if (r.dispute) disputes.push(`${x.toFixed(0)},${z.toFixed(0)}: ${r.dispute}`)
  }
  shores++
  const armoured = Object.entries(tally).filter(([k]) => k.startsWith('ARMOUR')).reduce((a, [, c]) => a + c, 0)
  console.log(`\n  ${unresolved ? '⛔' : '✅'} ${scene} — ${n.toLocaleString()} shoreline vertices, ${(100 * armoured / n).toFixed(1)}% armoured`)
  for (const [k, c] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`       ${k.padEnd(24)} ${String(c).padStart(6)}  ${(100 * c / n).toFixed(1)}%`)
  }
  if (disputes.length) {
    console.log(`     ⚠️ ${disputes.length} dispute(s) — the map and the ground disagree; the ordered rule still answers:`)
    for (const d of disputes.slice(0, 3)) console.log(`        ${d}`)
    if (disputes.length > 3) console.log(`        … and ${disputes.length - 3} more`)
  }
  if (unresolved) fail.push(`   ${scene}: ${unresolved} shoreline vertices resolved to NOTHING. A revetment would place nothing there, silently.`)
}

console.log(`\n  ${shores} shoreline(s) classified · ${dry} town(s) without one`)
console.log(`  constants, both MATERIAL (properties of rock, not of a town): min armour D50 ${MIN_ARMOUR_D50_M} m · riprap repose ${RIPRAP_REPOSE_DEG}° · tag reach ${TAG_REACH_M} m`)
if (fail.length) {
  console.error(`\n⛔ THE SHORE DOES NOT SAY WHAT IT IS MADE OF:\n${fail.join('\n')}`)
  process.exit(1)
}
console.log('\n✅ every shoreline vertex resolves to a named verdict, from data already on disk')
