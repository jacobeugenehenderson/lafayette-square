// Revetment, 2026-09-24 — WHAT IS THE REVETMENT'S TOE FOUNDED ON?
//
// Marram saw jagged dark-blue lobes along huron's waterline. They are not a water artifact:
// there is STONE TEXTURE inside them. They are the submerged toe of the revetment seen
// through translucent water, and its ragged lower edge is silhouetted against open water.
//
// The raggedness is DESIGNED (`revetmentDrape.js`: EDGE_WANDER 0.22 + EDGE_RAGGED 0.14 band
// fractions) — a real riprap toe is not a straight line, and calling that a defect would be
// calling the authoring a defect. ⭐ So this probe does not measure the raggedness. It asks
// the one thing the raggedness depends on: WHAT IS BEHIND IT.
//
// The drape places every vertex at `y = waterY + h * (1 - u)`, u running 0 at the crest to
// 1 at the nominal toe. So the nominal toe sits EXACTLY ON THE WATER PLANE, and the sheet is
// built out to u = U_HI = 1.35 with the kept edge wandering to ~1.36 — i.e. up to ~0.36·h
// BELOW the waterline. A real revetment's toe is founded on the BED.
//
// ⇒ This reports, per armoured station, the bed height at the toe against the lowest y the
// drape actually builds there. Positive gap = stone hanging above the bed with water behind
// it, which is exactly what a silhouette needs.
//
// ⛔ It states no cause it has not measured. It reports two distributions and the geometry
// that produced them; what the fix is (found the toe on the bed · stop overbuilding below
// water · draw the bed) is a design question and is NOT decided here.
//
//   node scratch/revetment-toe-founding.mjs [scene]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revetmentFaces } from '../src/lib/revetmentFromSlab.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = process.argv[2] || 'huron'

// ⛔ The same three constants the drape uses. Read from its SOURCE, never retyped — a copy
// here would drift the moment someone tunes the toe and this probe would quietly lie.
const drapeSrc = readFileSync(join(ROOT, 'src', 'lib', 'revetmentDrape.js'), 'utf8')
const num = (name) => {
  const m = drapeSrc.match(new RegExp(`${name}\\s*=\\s*(-?[\\d.]+)`))
  if (!m) throw new Error(`revetment-toe-founding: could not read ${name} out of revetmentDrape.js — it was renamed or restructured, and this probe must not guess it.`)
  return parseFloat(m[1])
}
const U_HI = num('U_HI'), EDGE_WANDER = num('EDGE_WANDER'), EDGE_RAGGED = num('EDGE_RAGGED')
const TAN_REPOSE = Math.tan((parseFloat((drapeSrc.match(/riprapReposeDeg[^\d]*(\d+)/) || [])[1] || 35)) * Math.PI / 180)
// The furthest down the KEPT sheet can reach, in band fractions past the nominal toe.
const U_TOE_MAX = Math.min(U_HI, 1 + EDGE_WANDER * 1.0 + EDGE_RAGGED)

const doc = JSON.parse(readFileSync(join(ROOT, 'public', 'baked', scene, 'revetment.json'), 'utf8'))
const tm = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.json'), 'utf8'))
const tb = readFileSync(join(ROOT, 'cartograph', 'data', scene, 'clean', 'terrain.bin'))
const tf = new Float32Array(tb.buffer, tb.byteOffset, tb.length / 4)
const stepX = (tm.bounds.maxX - tm.bounds.minX) / (tm.width - 1)
const stepZ = (tm.bounds.maxZ - tm.bounds.minZ) / (tm.height - 1)
const heightAt = (x, z) => {      // bake-revetment's sampler, same rounding. y=0 IS the water.
  const gx = Math.round((x - tm.bounds.minX) / stepX), gz = Math.round((z - tm.bounds.minZ) / stepZ)
  if (gx < 0 || gz < 0 || gx >= tm.width || gz >= tm.height) return NaN
  const v = tf[gz * tm.width + gx]
  return Number.isFinite(v) ? v : NaN
}

console.log(`scene ${scene} · datum "${tm.datum}" · repose tan ${TAN_REPOSE.toFixed(3)} · U_HI ${U_HI} · kept toe reaches u=${U_TOE_MAX.toFixed(3)} (${((U_TOE_MAX-1)*100).toFixed(0)}% of h below the waterline)\n`)

const gaps = [], beds = [], depths = []
let armoured = 0, noBed = 0
for (const f of revetmentFaces(doc)) {
  const st = f.stations
  for (let i = 0; i < st.length; i++) {
    const s = st[i]
    if (!s.armour) continue
    armoured++
    // along-shore tangent, then the waterward normal — the drape's own construction
    const a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i + 1)]
    const tx = b.x - a.x, tz = b.z - a.z, m = Math.hypot(tx, tz) || 1
    const nx = tz / m, nz = -tx / m          // right-hand normal of the walk = waterward
    const h = s.crest
    const run = h / TAN_REPOSE
    // the plan position of the LOWEST kept vertex, and the y it is built at
    const toeX = s.x + nx * (U_TOE_MAX * run), toeZ = s.z + nz * (U_TOE_MAX * run)
    const builtY = h * (1 - U_TOE_MAX)       // negative: below the water plane
    const bed = heightAt(toeX, toeZ)
    if (!Number.isFinite(bed)) { noBed++; continue }
    beds.push(bed); depths.push(-builtY); gaps.push(builtY - bed)
  }
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] }
const line = (name, a, u = 'm') => console.log(`  ${name.padEnd(34)} min ${q(a,0).toFixed(2)} · p10 ${q(a,0.1).toFixed(2)} · med ${q(a,0.5).toFixed(2)} · p90 ${q(a,0.9).toFixed(2)} · max ${q(a,1).toFixed(2)} ${u}`)

console.log(`${armoured} armoured station(s); ${gaps.length} with a bed sample, ${noBed} off the heightfield\n`)
line('bed height at the toe', beds)
line('how far below water the stone goes', depths)
line('stone toe MINUS bed', gaps)

const hanging = gaps.filter(g => g > 0).length
const buried  = gaps.filter(g => g <= 0).length
console.log(`\n  toe ABOVE the bed (water behind the stone — a silhouette is possible): ${hanging} (${(100*hanging/gaps.length).toFixed(1)}%)`)
console.log(`  toe AT or BELOW the bed (stone founded, nothing to see through):     ${buried} (${(100*buried/gaps.length).toFixed(1)}%)`)
console.log(`\n⛔ Cause of the lobes' SHAPE not established here — this measures only what the toe stands on.`)
