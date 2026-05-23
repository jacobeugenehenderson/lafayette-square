// Probe Lafayette Park's frontage edges + bands. Look for breaks at T-intersections
// along the park-bordering streets (Park Ave, Mississippi, Lafayette, Missouri).
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design  = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json'), 'utf-8'))
const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const scale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x,z]) => [center[0]+(x-center[0])*scale, center[1]+(z-center[1])*scale])

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

function pointInRing(px,py,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],zi=r[i][1],xj=r[j][0],zj=r[j][1];if((zi>py)!==(zj>py)&&px<(xj-xi)*(py-zi)/(zj-zi)+xi)inside=!inside}return inside}

// Lafayette Park's block ring (contains origin).
let parkIdx = -1
for (let i=0;i<v2.blockSharp.length;i++) if (pointInRing(0,0,v2.blockSharp[i])) { parkIdx = i; break }

// blockKey of park block
function blockKeyFromRing(ring) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity
  for(const p of ring){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1])}
  const cx = (minX+maxX)/2, cz = (minZ+maxZ)/2
  const x=Math.round(cx*2)/2, z=Math.round(cz*2)/2
  return `${x.toFixed(1)},${z.toFixed(1)}`
}
const parkKey = blockKeyFromRing(v2.blockSharp[parkIdx])
console.log('Lafayette Park blockKey:', parkKey)

// Frontage edges for the park block
const parkFEs = v2.frontageEdges.filter(fe => fe.blockKey === parkKey)
console.log(`\nFrontage edges for Lafayette Park: ${parkFEs.length}`)
for (const fe of parkFEs) {
  const chain = ribbons.streets[fe.chainIdx]
  console.log(`  fe blockKey=${fe.blockKey} edgeOrd=${fe.edgeOrd} chainIdx=${fe.chainIdx} (${chain?.name || '?'}) side=${fe.side} segOrds=[${fe.segOrds?.join(',')}]`)
}

// Frontage bands for the park block
const parkBands = v2.frontageBands.filter(fb => fb?.blockKey === parkKey)
console.log(`\nFrontage band entries for Lafayette Park: ${parkBands.length}`)
for (const fb of parkBands) {
  const chain = ribbons.streets[fb.chainIdx]
  console.log(`  fb blockKey=${fb.blockKey} edgeOrd=${fb.edgeOrd} chain=${chain?.name} side=${fb.side} segOrds=[${fb.segOrds?.join(',')}]  asphalt=${fb.asphaltRings?.length||0} tl=${fb.treelawnRings?.length||0} sw=${fb.sidewalkRings?.length||0}  caps=${fb.kind||'?'}`)
}
