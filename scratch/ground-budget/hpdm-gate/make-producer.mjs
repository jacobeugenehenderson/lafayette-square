// make-producer.mjs — the producer-only copy of a bake-ground.js: it stops right after buildDeformer (so the ② height
// throw, if any, fires) and prints the deformer's stats. Written beside this file; never into src/ or cartograph/.
//   node make-producer.mjs <bake-ground.js> [dump.json] → bake-ground.producer.js; with dump.json it also writes the deformer's
//   inputs as passed (the painted bands, the stencil, the tiles) there, for deform-trace.mjs (its --bands)
import { readFileSync, writeFileSync } from 'fs'
// the band pieces (tileGround's `protoBandPieces`, per tile index of shapeArtifact), carried out of buildTileGround's return
const bp = '  const pr = buildTileGround(ribbons, {'
let src = readFileSync(process.argv[2], 'utf8'), a = '    // ⭐ THE EASE\'S END IS A LINE OF THE PARTITION'
if (src.split(bp).length !== 2) throw new Error('make-producer: buildTileGround anchor not found exactly once')
src = src.replace(/(  const pr = buildTileGround\(ribbons, \{[\s\S]*?\n  \}\)\n)/, '$1  globalThis.__bandPieces = pr.protoBandPieces ?? null\n')
if (!src.includes('globalThis.__bandPieces = pr.protoBandPieces')) throw new Error('make-producer: could not carry the band pieces out')
if (src.split(a).length !== 2) throw new Error('make-producer: anchor not found exactly once')
const dump = process.argv[3] ? `    ;(await import('fs')).writeFileSync(${JSON.stringify(process.argv[3])}, JSON.stringify({ bands: { curb: [...painted('curb'), ...painted('curbCut')], lawn: painted('treelawn'), walk: painted('sidewalk') }, stencil: stencil.clipPolygon, tiles: shapeArtifact, ink: inkPieces, easeSites: globalThis.__easeSites ?? null, bandPieces: globalThis.__bandPieces ?? null }))\n` : ''
writeFileSync(new URL('bake-ground.producer.js', import.meta.url), src.replace(a, dump + '    console.log(`[producer-only] deformer built · stats ${JSON.stringify(deform.stats)}`); process.exit(0)\n' + a))
