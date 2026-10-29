// hmax-ab.mjs — drapeGlobals takes hMax/toeMax from 201 samples of t whatever the face's length; on a long face with
// short armour they miss it, the lattice collapses to nAcross 3 and the face builds NOTHING at any distance. Experiment:
// sample at the face's own stations (revetmentDrape.hmax.mjs). Per face that changes: nAcross and tris, far and near.
// ▶ node scratch/far-shore/hmax-ab.mjs --look=provincetown
import { readFileSync } from 'node:fs'
import { prepareFaces } from '../../cartograph/bake-revetment-far.js'
import * as A from '../../src/lib/revetmentDrape.js'
import * as B from './revetmentDrape.hmax.mjs'
const look = process.argv.find(a => a.startsWith('--look='))?.slice(7), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
let changed = 0, empty = [0, 0], farT = [0, 0], nearT = [0, 0]
for (const f of faces) {
  const g = (M, oct, near) => M.drapeGlobals({ poly: f.poly, crestAt: f.crestAt, ...(near ? { toeAt: f.toeAt, berm: f.berm } : {}), octaves: oct })
  const ga = g(A, 1), gb = g(B, 1), na = g(A, 3, true), nb = g(B, 3, true)
  const same = ga.hMax === gb.hMax && ga.nAcross === gb.nAcross && na.hMax === nb.hMax && na.nAcross === nb.nAcross
  const far = (M, G) => M.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 1, globals: G }).stats.tris
  const fa = far(A, ga), fb = same ? fa : far(B, gb); farT[0] += fa; farT[1] += fb; if (!fa) empty[0]++; if (!fb) empty[1]++
  if (same) continue
  changed++
  const near = (M, G) => M.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 3, globals: G }).stats.tris
  const ra = near(A, na), rb = near(B, nb); nearT[0] += ra; nearT[1] += rb
  console.log(`  ${f.key.padEnd(9)} hMax ${ga.hMax.toFixed(2)} → ${gb.hMax.toFixed(2)} m · far nAcross ${ga.nAcross} → ${gb.nAcross}, tris ${fa} → ${fb} · near nAcross ${na.nAcross} → ${nb.nAcross}, tris ${ra} → ${rb}`)
}
console.log(`${look}: ${changed} of ${faces.length} faces change · armoured faces with NO far geometry ${empty[0]} → ${empty[1]} · far tris ${farT[0]} → ${farT[1]} · near tris on the changed faces ${nearT[0]} → ${nearT[1]}`)
