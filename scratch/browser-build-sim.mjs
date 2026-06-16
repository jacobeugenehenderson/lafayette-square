// Replicate the EXACT browser live build: _loadCenterlines → mergeLiveRibbons → buildTileGround
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { mergeLiveRibbons } from '../src/lib/mergeLiveRibbons.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const skel = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/skeleton.json', import.meta.url)))
// _loadCenterlines: build centerlineData.streets from skel, points from ribbons
const ribbonById = new Map((ribbons.streets||[]).map(r => [r.skelId, r]))
const liveStreets = (skel.streets||[]).map(s => {
  const rb = ribbonById.get(s.id)
  const rbPoints = rb?.points
  const points = (rbPoints && rbPoints.length >= 2)
    ? rbPoints.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])
    : (s.points||[]).map(p => [p.x, p.z])
  return { id: s.id, name: s.name, type: s.highway||'residential', oneway: !!s.oneway, points, segments: rb?.segments }
})
console.log('skeleton streets:', (skel.streets||[]).length, '| liveStreets:', liveStreets.length)
const liveRibbons = mergeLiveRibbons(ribbons, liveStreets)
console.log('liveRibbons has tiles?', Array.isArray(liveRibbons.tiles), liveRibbons.tiles?.length, '| carriageway phase preserved?', liveRibbons.streets.filter(s=>/^carriageway/.test(s.phase?.role||'')).length)
for (const smooth of [0, 1.5]) {
  const out = buildTileGround(liveRibbons, { smooth, curbWidth: 0.1524, emitArtifact: true })
  const sa = out._shapeArtifact || []
  console.log(`BROWSER-SIM smooth=${smooth}: isMedian tiles=${sa.filter(t=>t.isMedian).length}  median grass rings=${((out.luByClass?.median)||[]).length}`)
}
