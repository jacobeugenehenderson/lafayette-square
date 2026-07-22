import { readFileSync } from 'fs'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'
const scene=process.argv[2], NODE=[+process.argv[3],+process.argv[4]]
const rib = scene==='lafayette-square' ? '../src/data/ribbons.json' : `../cartograph/data/${scene}/clean/ribbons.json`
const r = JSON.parse(readFileSync(new URL(rib, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact:true }
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const A=buildTileGround(stripped,opts), B=buildTileGround(r,opts)
const near=(rings,rad=15)=>{let n=0;for(const rr of(rings||[]))for(const p of rr){if(Math.hypot(p[0]-NODE[0],p[1]-NODE[1])<rad)n++}return n}
const soA=sectionOpen(A._shapeArtifact,opts.curbWidth,{outer:'LU',inner:'SW'},clip)
const soB=sectionOpen(B._shapeArtifact,opts.curbWidth,{outer:'LU',inner:'SW'},clip)
console.log(`${scene} @[${NODE}]  frozen curb verts near: base ${near(soA.curb)} new ${near(soB.curb)}  ${near(soA.curb)===near(soB.curb)?'(SHAPE unchanged)':'(SHAPE changed)'}`)
// incidence: what pieces + roadId/throughId meet here
const vk=p=>Math.round(p[0]*100)/100+','+Math.round(p[1]*100)/100
const inc=[]; for(const s of (r.streets||r)){const p=s.points;if(!p)continue;for(const q of [p[0],p[p.length-1]]){if(Math.hypot(q[0]-NODE[0],q[1]-NODE[1])<1.5)inc.push(`${s.skelId}(rid=${s.roadId},tid=${s.throughId},thru=${JSON.stringify(s.through)})`)}}
console.log('  incident chain-ends:', inc.join(' | ')||'(none within 1.5m — through-road passes as mid-chain)')
