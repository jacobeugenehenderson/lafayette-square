import fs from 'fs'
import { sectionPassTile } from '../src/lib/tileGround.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const st = JSON.parse(JSON.stringify(shape.tiles[53]))
const cw = CURB_WIDTH
const stripMat = { outer:'LU', inner:'SW' }

const area = (rings)=>rings.reduce((s,r)=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return s+Math.abs(a)/2},0)
const sumLu = (m)=>Object.values(m).reduce((s,rings)=>s+area(rings),0)

function run(label, tile){
  const r = sectionPassTile(tile, cw, stripMat, null)
  console.log(`${label}: Wacc(SW)=${area(r.Wacc).toFixed(1)}m2 tlByLu=${sumLu(r.tlByLu).toFixed(1)} luByLu=${sumLu(r.luByLu).toFixed(1)}`)
  return r
}

console.log("=== BASELINE (collapsed mouth) ===")
const base = run("base", st)

// Now SPLIT the albion mouth coord. albion runs: run[1] left (mouth->tip), run[2] right (tip->mouth).
// mouth = -177.5,-78.7. The two mouth fillets: f1=-184.68,-85.45 ; f2=-186.47,-74.61.
// Split the mouth toward each fillet (perpendicular to the through-street missouri).
// Direction from mouth toward each fillet apex (these are the curb corners):
const mouth=[-177.5,-78.7]
const f1=[-184.68,-85.45], f2=[-186.47,-74.61]
const dirTo=(f)=>{const dx=f[0]-mouth[0],dy=f[1]-mouth[1];const L=Math.hypot(dx,dy)||1;return [dx/L,dy/L]}
// nudge each mouth coord a small distance toward its fillet so cornerT keys differ + nearest-fillet pairs right
const EPS = 0.5  // m
const d1=dirTo(f1), d2=dirTo(f2)
const m1=[mouth[0]+d1[0]*EPS, mouth[1]+d1[1]*EPS]  // for the run-end nearest f1
const m2=[mouth[0]+d2[0]*EPS, mouth[1]+d2[1]*EPS]  // for the run-end nearest f2

const st2 = JSON.parse(JSON.stringify(shape.tiles[53]))
// run[1] albion/left ends at mouth (poly[last]); run[2] albion/right starts at mouth (poly[0])
// Also missouri run[0] ends at mouth, run[3] starts at mouth. Which side pairs which fillet?
// Try: albion/left end -> m1 (near f1), albion/right start -> m2 (near f2)
const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.01
for(const r of st2.runs){
  if(r.skelId==='albion-place'){
    const last=r.poly.length-1
    if(near(r.poly[0],mouth)) r.poly[0] = (r.side==='right'?m2:m1)
    if(near(r.poly[last],mouth)) r.poly[last] = (r.side==='left'?m1:m2)
  }
}
console.log("\n=== SPLIT mouth (EPS=0.5, toward fillets) ===")
const split = run("split", st2)
