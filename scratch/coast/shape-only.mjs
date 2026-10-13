// shape-only.mjs — bake-ground up to shape.json, then exit before the deformer (Boz's plan B, 2026-10-13). Scratch only.
// Writes a copy of the LIVE cartograph/bake-ground.js with one insertion just after the line heights and the gusset
// record are stamped (before the map overlays, the flatten and the deformer): shape.json written exactly as the full bake
// writes it at its end ({ tiles, highway, gusset }), then process.exit(0). Run it in memory through the swap:
//   node scratch/coast/shape-only.mjs <copy.js>   # writes the copy, prints the SWAP_MAP
//   SWAP_MAP=… node --max-old-space-size=12000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=<t> --scene=<t> --shore=pending --out-dir=<scratch>
// ⚠️ What the full bake adds to shape.json after this point is not in this file; the coast runs' poly, h and gusset are.
import { readFileSync, writeFileSync } from 'fs'
const out = process.argv[2]; if (!out) throw new Error('usage: shape-only.mjs <copy.js>')
const live = new URL('../../cartograph/bake-ground.js', import.meta.url).pathname
const src = readFileSync(live, 'utf8')
const at = '  // ── Inject map.json overlays into byMaterial'
if (src.split(at).length !== 2) throw new Error(`shape-only: bake-ground.js no longer has "${at.trim()}" once — re-aim the insertion`)
const ins = `  // SHAPE-ONLY (scratch/coast/shape-only.mjs): shape.json as the full bake writes it, then exit before the deformer.
  if (shapeArtifact) writeIfChanged(join(outDir, 'shape.json'), JSON.stringify({ tiles: shapeArtifact, highway: highwayRings || [], ...(gussetRecord ? { gusset: gussetRecord } : {}) }))
  console.log('  [shape-only] wrote ' + join(outDir, 'shape.json') + ' — exiting before the deformer'); process.exit(0)
`
writeFileSync(out, src.replace(at, ins + at))
console.log(JSON.stringify({ '/cartograph/bake-ground.js': out }))
