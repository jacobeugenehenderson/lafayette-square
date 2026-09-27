// claims-every-mapped-stone-structure-is-stone.mjs — DOES EVERY MAPPED BREAKWATER AND GROYNE CARRY STONE?
//
// ⭐ THE INVARIANT: every `man_made=breakwater|groyne` in a town's fetch, inside the drawing, is RULED along its whole
// outline — a revetment station within the tag's reach (shore-armour TAG_REACH_M), armoured or bare for a named reason
// (a structure's own walk bares `below-one-course` where the terrain shows no rock above the water) — whether the shore
// walk reached it or its own walk did (bake-revetment "every mapped breakwater and groyne is stone", Jacob 2026-09-27).
// The share that carries stone is printed beside it.
// ⛔ WHY: the revetment walked only the drawn shore, so a structure the drawing left INSIDE the water had no shore and
// took no stone, silently — two of provincetown's three breakwaters. Nothing said so.
// ⭐ The structures are read from the SOURCE (raw/osm.json, via structures.mjs), never from the artifact's own census,
// so a bake that forgot a structure cannot also vouch for it.
// ⚠️ It proves stations exist; whether a heap STANDS there is the crest, which the terrain's rock supplies — the
// census `noRockM` reports it, and "does it look like rock" stays Jacob's eye.
// ⭐ MUTATION TEST (built in): the first town's structure walks are removed and the check must go RED.
//
//   node checks/claims-every-mapped-stone-structure-is-stone.mjs                 # every baked town
//   node checks/claims-every-mapped-stone-structure-is-stone.mjs provincetown [--revetment=<path>]
// Read-only. Exits 1 if any mapped structure inside the drawing is short of stone.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stoneStructures } from '../cartograph/structures.mjs'
import { TAG_REACH_M } from '../cartograph/shore-armour.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const only = args.find(a => !a.startsWith('--')) || null
const revArg = args.map(a => a.match(/^--revetment=(.+)$/)).find(Boolean)?.[1] || null
const MIN_COVER = 0.9   // a structure's ends and corners may sit a step outside the reach; less than this is a gap

/** [{ id, kind, name, insideM, cover, stone }] — per structure, the share of its outline inside the drawing that is
 *  ruled (any station near) and the share with stone (an armoured station near). */
function audit(doc, osm, disc) {
  const index = (st) => {
    const cell = TAG_REACH_M, grid = new Map()
    for (const s of st) { const k = `${Math.floor(s.x / cell)},${Math.floor(s.z / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(s) }
    return (x, z) => {
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell)
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of grid.get(`${gx + i},${gz + j}`) || []) if (Math.hypot(s.x - x, s.z - z) <= TAG_REACH_M) return true
      return false
    }
  }
  const all = doc.arcs.flatMap(a => a.stations)
  const near = index(all), stoneNear = index(all.filter(s => s.armour))
  const { areas, lines } = stoneStructures(osm.ground)
  const out = []
  for (const s of [...areas.map(a => ({ ...a, pts: [...a.ring, a.ring[0]] })), ...lines.map(l => ({ ...l, pts: l.line }))]) {
    let L = 0, C = 0, A = 0
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / doc.gridM))
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t
        if (Math.hypot(x - disc.center[0], z - disc.center[1]) > disc.radius) continue
        L += len / n; if (near(x, z)) C += len / n; if (stoneNear(x, z)) A += len / n
      }
    }
    if (L > 0) out.push({ id: s.id, kind: s.kind, name: s.name, insideM: L, cover: C / L, stone: A / L })
  }
  return out
}

let failed = false, towns = 0
const looks = readdirSync(join(ROOT, 'public', 'baked'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
let mutated = null
for (const look of looks) {
  if (only && look !== only) continue
  const p = revArg && only ? revArg : join(ROOT, 'public', 'baked', look, 'revetment.json')
  if (!existsSync(p)) continue
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  const scene = doc.scene || look
  const osmP = join(ROOT, 'cartograph', 'data', scene, 'raw', 'osm.json'), bndP = join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json')
  if (!existsSync(osmP) || !existsSync(bndP)) { console.log(`  ⚠️ ${look.padEnd(16)} revetment present but no raw/osm.json or boundary — CANNOT VERIFY`); failed = true; continue }
  const osm = JSON.parse(readFileSync(osmP, 'utf8')), disc = JSON.parse(readFileSync(bndP, 'utf8'))
  const res = audit(doc, osm, disc)
  if (!res.length) { console.log(`  ${look.padEnd(18)} no mapped breakwater/groyne inside the drawing`); continue }
  towns++
  const short = res.filter(r => r.cover < MIN_COVER)
  const tot = res.reduce((a, r) => a + r.insideM, 0), cov = res.reduce((a, r) => a + r.insideM * r.cover, 0), stone = res.reduce((a, r) => a + r.insideM * r.stone, 0)
  console.log(`  ${short.length ? '⛔' : '✅'} ${look.padEnd(16)} ${res.length} structure(s), ${(tot / 1000).toFixed(2)} km of outline in the drawing, ruled along ${(100 * cov / tot).toFixed(0)}%, stone along ${(100 * stone / tot).toFixed(0)}%` +
              (doc.structures ? '' : '  (artifact predates structure walks — re-bake the revetment)'))
  for (const r of short) console.log(`       ${r.kind} ${r.id}${r.name ? ` "${r.name}"` : ''}: ruled along ${(100 * r.cover).toFixed(0)}% of ${r.insideM.toFixed(0)} m — the rest was never walked`)
  if (short.length) failed = true
  if (!mutated && doc.structures?.length) mutated = { doc, osm, disc, look }
}

// ⭐ The mutation: without the structure walks, a town that has any in-water structure must go red.
if (mutated) {
  const { doc, osm, disc, look } = mutated
  const cut = audit({ ...doc, arcs: doc.arcs.filter(a => !a.structure) }, osm, disc).filter(r => r.cover < MIN_COVER)
  const hasOwn = doc.arcs.some(a => a.structure)
  if (hasOwn && !cut.length) { console.log(`  ⛔ MUTATION SURVIVED: ${look} with its structure walks removed still reads green — this check cannot see the defect`); failed = true }
  else if (hasOwn) console.log(`  ✅ mutation: ${look} without its structure walks goes red (${cut.length} structure(s) short)`)
}

console.log(`\n  ${towns} town(s) with mapped stone structures audited · reach = shore-armour TAG_REACH_M (${TAG_REACH_M} m) · short = ruled along < ${100 * MIN_COVER}%`)
if (failed) { console.log('\n⛔ a mapped breakwater or groyne was never walked'); process.exit(1) }
console.log('\n✅ every mapped breakwater and groyne in the drawing is ruled — stone, or bare for a named reason')
