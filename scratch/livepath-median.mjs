import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
console.log('ribbons.json has tiles?', Array.isArray(r.tiles), 'count:', (r.tiles||[]).length)
const cwPhase = r.streets.filter(s=>/^carriageway/.test(s.phase?.role||'')).length
console.log('carriageway streets with phase:', cwPhase)
for (const smooth of [0, 1.5]) {
  const out = buildTileGround(r, { smooth, curbWidth: 0.1524, emitArtifact: true })
  const sa = out._shapeArtifact || []
  const med = (out.luByClass?.median)||[]
  console.log(`smooth=${smooth}: isMedian tiles=${sa.filter(t=>t.isMedian).length}  median grass rings=${med.length}  (tiles path: ${smooth>0?'extractFaces (live walk)':'tilesFromFrozen'})`)
}
