// Zob's minimal repro for nodeCrossings' verifier refusal on Huron's close (fixtures/noder-repro-<x>.json, saved by cand3.mjs#arrange
// under CUTONCE_REPRO): (1) the named rings ALONE, (2) cropped to open paths of the segments within --r metres of the crossing,
// each run with `self` and permissive `pairs`, as cand3 calls it. node scratch/cut-once/noder-repro.mjs <fixture> [--r=5]
import fs from 'fs'
import { nodeCrossings } from '../../src/lib/latticeNode.js'
const f = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), at = String(f.error).match(/at \(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number)
const r = +(process.argv.find(a => a.startsWith('--r='))?.slice(4) || 5)
const run = (rings, what) => { try { nodeCrossings(rings, { pairs: () => true, self: true, who: what }); return 'GREEN (no refusal)' } catch (e) { return 'REFUSES: ' + String(e.message).slice(0, 200) } }
console.log('(1) the two rings alone:', run(f.rings.map(x => ({ p: x.p, tag: x.tag })), 'repro-rings'))
// cropped: each maximal run of a ring's consecutive vertices within r of the crossing, as an open path
const crop = []; for (const x of f.rings) { let cur = []; const flush = () => { if (cur.length >= 2) crop.push({ p: cur, tag: `${x.tag}@${crop.length}`, open: true }); cur = [] }
  x.p.forEach(q => { if (Math.hypot(q[0] - at[0], q[1] - at[1]) <= r) cur.push(q); else flush() }); flush() }
console.log(`(2) cropped to ${r} m: ${crop.length} open path(s), ${crop.reduce((t, c) => t + c.p.length, 0)} vertices:`, run(crop, 'repro-crop'))
if (process.argv.includes('--write')) fs.writeFileSync(process.argv[2].replace(/\.json$/, `-crop${r}.json`), JSON.stringify({ at, r, paths: crop }))
