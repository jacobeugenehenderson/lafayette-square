// coclaim-by-pair.mjs — WHICH layer-pair co-claims, and where?
// corner-coclaim.mjs tells us 1403.8 m² is double-owned but not by WHICH pair.
// The fix design depends on it: sw∩tl (pad laps leg treelawn) vs sw∩lu vs tl∩lu.
// Same sampler as corner-coclaim (r=9, apex-centred) but tallies the PAIR and
// prints the per-apex pair mix for the worst apexes. READ-ONLY.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const STEP = +(process.argv[2] || 0.2)
const TOP = +(process.argv[3] || 12)
const R = 9
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true, blockCustoms: design.blockCustoms || null, curbWidth: design.curbWidth ?? 0.15 })
console.log = o
const prep = (rings) => (rings || []).map(r => { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for (const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]} return {r,x0,y0,x1,y1} })
const inR = (idx,x,y)=>{let ins=false;for(const b of idx){if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)continue;const r=b.r;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}}return ins}
const TL = prep(Object.values(g.treelawnByLu || {}).flat())
const LU = prep(Object.values(g.luByClass || {}).flat())
const SW = prep(g.sidewalk)
const corners = []
for (const st of (g._shapeArtifact || [])) for (const f of (st.fillets || [])) if (f.apex) corners.push(f.apex)
const A = (n) => n * STEP * STEP
let swtl=0, swlu=0, tllu=0, tri=0
const rows = []
for (const apex of corners) {
  let a_swtl=0,a_swlu=0,a_tllu=0,a_tri=0
  for (let dx=-R;dx<=R;dx+=STEP) for (let dy=-R;dy<=R;dy+=STEP){
    if(dx*dx+dy*dy>R*R)continue
    const x=apex[0]+dx,y=apex[1]+dy
    const sw=inR(SW,x,y),tl=inR(TL,x,y),lu=inR(LU,x,y)
    const n=(sw?1:0)+(tl?1:0)+(lu?1:0)
    if(n<2)continue
    if(sw&&tl&&lu)a_tri++
    else if(sw&&tl)a_swtl++
    else if(sw&&lu)a_swlu++
    else if(tl&&lu)a_tllu++
  }
  swtl+=A(a_swtl);swlu+=A(a_swlu);tllu+=A(a_tllu);tri+=A(a_tri)
  const co=A(a_swtl+a_swlu+a_tllu+a_tri)
  rows.push({apex,co,swtl:A(a_swtl),swlu:A(a_swlu),tllu:A(a_tllu),tri:A(a_tri)})
}
console.log(`${corners.length} apexes · r=${R} · step=${STEP}`)
console.log(`\nCO-CLAIM by layer-pair (whole map):`)
console.log(`  sw∩tl : ${swtl.toFixed(1)} m²   (sidewalk laps treelawn — the pad-over-leg hypothesis)`)
console.log(`  sw∩lu : ${swlu.toFixed(1)} m²   (sidewalk laps block-LU)`)
console.log(`  tl∩lu : ${tllu.toFixed(1)} m²   (treelawn laps block-LU)`)
console.log(`  sw∩tl∩lu(triple): ${tri.toFixed(1)} m²`)
console.log(`  TOTAL : ${(swtl+swlu+tllu+tri).toFixed(1)} m²`)
rows.sort((a,b)=>b.co-a.co)
console.log(`\nworst ${TOP} apexes (pair mix):`)
for(const r of rows.slice(0,TOP)) console.log(`  [${r.apex[0].toFixed(0)},${r.apex[1].toFixed(0)}] co=${r.co.toFixed(1)}  swtl=${r.swtl.toFixed(1)} swlu=${r.swlu.toFixed(1)} tllu=${r.tllu.toFixed(1)} tri=${r.tri.toFixed(1)}`)
