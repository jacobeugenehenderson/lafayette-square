// READ-ONLY — what COVERS the median tiles? Decompose tile interior into
// asphalt(carriageway) vs junction-windows vs through-windows vs curb vs leftover.
// Replicate the shape-loop aFill stages by re-running buildTileGround and reading
// the frozen artifact, plus a direct asphalt-union ∩ tile measurement.
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const out = buildTileGround(r, { ...base })
const art = out._shapeArtifact
// asphalt union (final) ∩ each median tile
// reach Clipper helpers via a tiny re-import is messy; instead just measure:
//   medGrass rendered = (tile - iA(asphalt-carve)) leftover -> but luRemainder also minus bands.
// We approximate "what the operator sees as median" = the luByClass 'median' group area inside the tile bbox.
const medGroup = out.luByClass?.median || out.luByClass?.['median'] || null
console.log('luByClass keys:', Object.keys(out.luByClass||{}))
const medRings = (out.luByClass && (out.luByClass.median)) ? out.luByClass.median : []
let totMedGrass = 0; for(const ring of medRings) totMedGrass += area(ring)
console.log('Rendered median grass total area:', totMedGrass.toFixed(0), 'rings:', medRings.length)
// frozen median total
const fz = (r.medians||[]).filter(m=>m.kind==='median'); let fzA=0; for(const m of fz) fzA+=area(m.ring)
console.log('Frozen median total area:', fzA.toFixed(0))
console.log('=> rendered/frozen ratio:', (totMedGrass/fzA*100).toFixed(0)+'%')

// per median-tile: tile area vs the iA(block carve) area = the leftover the median can fill
const TARGETS = [30,90,102,33,34,71,82,88,89,95,100, 96,98,20,28]  // mix of bad+good
for(const ti of TARGETS){
  const st=art[ti]; if(!st) continue
  const ta=area(st.ring); const iaA=(st.iA||[]).reduce((a,rg)=>a+area(rg),0)
  const medClipA=(st.med||[]).reduce((a,rg)=>a+area(rg),0)
  // asphalt of this tile = tile - iA
  const asph = ta - iaA
  console.log(`tile ${String(ti).padStart(3)}: tileA=${ta.toFixed(0)} iA(block)=${iaA.toFixed(0)} asphalt=${asph.toFixed(0)} (${(asph/ta*100).toFixed(0)}%) medClip=${medClipA.toFixed(0)} tl=${st.tl} sw=${st.sw} runs=${st.runs.length}`)
}
