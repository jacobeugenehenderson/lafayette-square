// claims-coast-distance-is-the-coast.mjs — IS THE COAST-DISTANCE CHANNEL THE DISTANCE TO THIS TOWN'S COAST?
//
//   ① every shoreline run survives the dedupe: two different runs that merely start at
//      the same (rounded) point are both kept; a run repeated on several tiles, in either
//      direction, is kept once. (The old vertex-count + first-vertex key dropped a real
//      23 m run on Provincetown.)
//   ② the field is the distance: on a synthetic coast, every texel's value is the true
//      Euclidean distance to the polyline — exact near it, within the recorded bound far away.
//   ③ no coast is a named absence: a town with no `__water__` runs gets
//      `coastDist.absent` with a reason, never a zero field.
//   ④ what ships matches its source: a baked context.json names as many runs as its
//      shape.json holds, and a band nobody has resolved is reported as such.
//
// ▶ MUTATION-TEST IT:
//     · shoreRuns.mjs key back to `${r.poly.length}:${r.poly[0][0].toFixed(2)},…`     → ① RED
//     · in coastDistanceField, return a constant field (e.g. field.fill(100))         → ② RED
//     · in bakeCoastDistance, write coastDist: { mPerUnit: 0 } when there are no runs  → ③ RED
//   Put each back.
//
//   node checks/claims-coast-distance-is-the-coast.mjs
import fs from 'fs'
import os from 'os'
import path from 'path'
import { waterRuns } from '../cartograph/shoreRuns.mjs'
import { coastDistanceField, bakeCoastDistance } from '../cartograph/bake-coast-distance.js'

let red = 0
const bad = m => { red++; console.log(`   ⛔ ${m}`) }
const run = poly => ({ skelId: '__water__', poly })

console.log('① EVERY RUN SURVIVES THE DEDUPE')
{
  const a = [[10.001, 5.001], [20, 5], [30, 8]], b = [[10.004, 5.004], [10, 25], [12, 40]]   // same rounded start + count
  const n1 = waterRuns({ tiles: [{ runs: [run(a), run(b)] }] }).length
  n1 === 2 ? console.log('   ✅ two different runs sharing a rounded start → both kept')
           : bad(`two different runs sharing a rounded start → ${n1} kept, expected 2`)
  const n2 = waterRuns({ tiles: [{ runs: [run(a)] }, { runs: [run(a)] }, { runs: [run([...a].reverse())] }] }).length
  n2 === 1 ? console.log('   ✅ one run on three tiles (once reversed) → kept once')
           : bad(`one run on three tiles (once reversed) → ${n2} kept, expected 1`)
}

console.log('② THE FIELD IS THE DISTANCE')
{
  const grid = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, width: 81, height: 81 }   // 2.5 m texels
  const coast = [[-100, 10], [0, 10], [60, -40]]
  const segD = (px, pz, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - t * dx, pz - az - t * dz) }
  const { field, errBoundM } = coastDistanceField([coast], grid)
  let worstNear = 0, worstFar = 0
  for (let j = 0; j < 81; j++) for (let i = 0; i < 81; i++) {
    const x = -100 + i * 2.5, z = -100 + j * 2.5
    const truth = Math.min(segD(x, z, coast[0], coast[1]), segD(x, z, coast[1], coast[2]))
    const e = Math.abs(field[j * 81 + i] - truth)
    if (truth <= 2 * 2.5) worstNear = Math.max(worstNear, e); else worstFar = Math.max(worstFar, e)
  }
  worstNear < 1e-3 ? console.log(`   ✅ within two texels of the coast: exact (max error ${worstNear.toExponential(1)} m)`) : bad(`near-coast error ${worstNear.toFixed(3)} m`)
  worstFar <= errBoundM ? console.log(`   ✅ beyond: max error ${worstFar.toFixed(2)} m ≤ the recorded bound ${errBoundM.toFixed(2)} m`) : bad(`far error ${worstFar.toFixed(2)} m exceeds the recorded bound ${errBoundM.toFixed(2)} m`)
}

console.log('③ NO COAST IS A NAMED ABSENCE')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coastdist-'))
  fs.mkdirSync(path.join(tmp, 'public/baked/inland'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'cartograph/data/inland/clean'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'public/baked/inland/shape.json'), JSON.stringify({ tiles: [{ runs: [{ skelId: 'street-1', poly: [[0, 0], [1, 1]] }] }] }))
  fs.writeFileSync(path.join(tmp, 'cartograph/data/inland/clean/terrain.json'), JSON.stringify({ width: 3, height: 3, bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } }))
  const log = console.log; console.log = () => {}
  let out; try { out = bakeCoastDistance({ scene: 'inland', dataRoot: tmp, outRoot: tmp }) } finally { console.log = log }
  const c = out?.channels?.coastDist
  c?.absent === true && typeof c.why === 'string' && !c.bin && !fs.existsSync(path.join(tmp, 'public/baked/inland/context.coastDist.bin'))
    ? console.log(`   ✅ absent, and says why: "${c.why}"`) : bad(`a coastless town produced ${JSON.stringify(c)}`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('④ WHAT SHIPS MATCHES ITS SOURCE')
for (const look of fs.existsSync('public/baked') ? fs.readdirSync('public/baked') : []) {
  const ctx = path.join('public/baked', look, 'context.json'), shp = path.join('public/baked', look, 'shape.json')
  if (!fs.existsSync(ctx) || !fs.existsSync(shp)) continue
  const c = JSON.parse(fs.readFileSync(ctx, 'utf8')).channels?.coastDist
  const n = waterRuns(JSON.parse(fs.readFileSync(shp, 'utf8'))).length
  if (!c) { bad(`${look}: context.json has no coastDist entry`); continue }
  if (c.absent) { n ? bad(`${look}: coastDist absent but shape.json has ${n} runs`) : console.log(`   ✅ ${look}: absent — ${c.why}`); continue }
  c.runs + (c.refused?.length || 0) === n ? console.log(`   ✅ ${look}: ${c.runs} runs = shape.json's ${n} · texel from: ${c.texelFrom}`)
                                          : bad(`${look}: context.json has ${c.runs} runs (+${c.refused?.length || 0} refused), shape.json has ${n} — re-bake the channel`)
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
