// make-producer.mjs — the producer-only copy of a bake-ground.js: it stops right after buildDeformer (so the ② height
// throw, if any, fires) and prints the deformer's stats. Written beside this file; never into src/ or cartograph/.
//   node make-producer.mjs <bake-ground.js> → bake-ground.producer.js
import { readFileSync, writeFileSync } from 'fs'
const src = readFileSync(process.argv[2], 'utf8'), a = '    // ⭐ THE EASE\'S END IS A LINE OF THE PARTITION'
if (src.split(a).length !== 2) throw new Error('make-producer: anchor not found exactly once')
writeFileSync(new URL('bake-ground.producer.js', import.meta.url), src.replace(a, '    console.log(`[producer-only] deformer built · stats ${JSON.stringify(deform.stats)}`); process.exit(0)\n' + a))
