import { readFileSync } from 'fs'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'
const scene='hipointe-demun', NODE=[153.6,386.1]
const r = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/clean/ribbons.json`, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact:true }
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const A=buildTileGround(stripped,opts), B=buildTileGround(r,opts)
const near=(rings,rad=14)=>{let n=0;for(const rr of(rings||[]))for(const p of rr){if(Math.hypot(p[0]-NODE[0],p[1]-NODE[1])<rad)n++}return n}
// 1) shapeArtifact iA total change near node
const iAall=(sa)=>sa.flatMap(t=>t.iA||[])
console.log('shapeArtifact iA verts near node:  base',near(iAall(A._shapeArtifact)),' new',near(iAall(B._shapeArtifact)))
console.log('shapeArtifact iA IDENTICAL overall:', JSON.stringify(iAall(A._shapeArtifact))===JSON.stringify(iAall(B._shapeArtifact)))
// 2) FROZEN sectionOpen curb (the shipped/bake consumer) near node
const soA=sectionOpen(A._shapeArtifact, opts.curbWidth, {outer:'LU',inner:'SW'}, clip)
const soB=sectionOpen(B._shapeArtifact, opts.curbWidth, {outer:'LU',inner:'SW'}, clip)
console.log('sectionOpen(frozen) curb verts near node: base',near(soA.curb),' new',near(soB.curb))
console.log('sectionOpen(frozen) curb IDENTICAL near node:', near(soA.curb)===near(soB.curb) && JSON.stringify(soA.curb)===JSON.stringify(soB.curb))
