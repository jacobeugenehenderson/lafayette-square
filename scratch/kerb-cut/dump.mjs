// THE OPEN KERB-CUT PROBLEM, made offline (Sill, 2026-10-07; BRIEF-corner-ramps-and-kerb §3 step 5 state).
// Writes an instrumented copy of bake-ground.js to <out>/bake-ground.mesh.js that dumps the conformed ground + the kerb's
// crease segments just before `cutAlong`, then stops; prints the one command that runs it (in memory, via swap.mjs).
//   node scratch/kerb-cut/dump.mjs <out dir> [scene]   → then run the printed command, then harness.mjs <out>/mesh
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
const out = resolve(process.argv[2] || '/tmp/kerb-cut'), scene = process.argv[3] || 'lafayette-square'
mkdirSync(out, { recursive: true })
const src = readFileSync(new URL('../../cartograph/bake-ground.js', import.meta.url), 'utf8')
const at = '      const cut = {}\n      bufs = cutAlong('
if (!src.includes(at)) throw new Error('dump.mjs: the cutAlong call site moved — update the anchor')
writeFileSync(`${out}/bake-ground.mesh.js`, src.replace(at, `      { const fs = await import('fs'), segs = kerbRegs.flatMap(g => g.poly.map((p, i) => [p, g.poly[(i + 1) % g.poly.length]]))
        fs.writeFileSync(process.env.MESH_DUMP + '.json', JSON.stringify({ keys: planeKeys, segs, sizes: bufs.map(x => [x.positions.length, x.indices.length]) }))
        fs.writeFileSync(process.env.MESH_DUMP + '.pos', Buffer.concat(bufs.map(x => Buffer.from(x.positions.buffer, x.positions.byteOffset, x.positions.byteLength))))
        fs.writeFileSync(process.env.MESH_DUMP + '.idx', Buffer.concat(bufs.map(x => Buffer.from(x.indices.buffer, x.indices.byteOffset, x.indices.byteLength))))
        throw new Error('dumped the conformed mesh + crease segments to ' + process.env.MESH_DUMP) }
` + at))
console.log(`SWAP_MAP='{"/cartograph/bake-ground.js":"${out}/bake-ground.mesh.js"}' MESH_DUMP=${out}/mesh node --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=${scene} --scene=${scene} --out-dir=${out}/slab`)
