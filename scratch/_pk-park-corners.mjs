// The park's two lost corners, located by STAGE — which ring first carries a spur.
//
// ⛔ CONVENTION, SETTLED FROM SOURCE, NOT ARGUED. `tileGround.js:131`:
//   SPUR_COS = cos(165°), and `in·out < SPUR_COS ⇒ turn > 165°`.
// TURN is the deflection between the incoming and outgoing direction: 0° = straight,
// 180° = full reversal. Every angle below is a TURN, tested with the code's own
// dot-product form so it cannot disagree with `dropFoldSpursTracked`.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const SPUR_COS = Math.cos(165 * Math.PI / 180)
const sa=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
const turn=(r,i)=>{const n=r.length,a=r[((i-1)%n+n)%n],v=r[i],b=r[(i+1)%n]
  const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1]
  const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy); if(li<1e-12||lo<1e-12) return null
  const d=(ix/li)*(ox/lo)+(iy/li)*(oy/lo)
  return { deg: Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI, spur: d < SPUR_COS } }
const R = Number(process.env.R || 30)
const JUNCTIONS=[['Mississippi × Park',229.0,-158.9],['Mississippi × Lafayette',166.5,221.9]]
const f=feed('lafayette-square'); const tg=buildProto(f)
const blocks=tg.proto.map((r,i)=>({r,i,a:sa(r)})).filter(o=>o.a<0)
const park=blocks.find(b=>Math.abs(Math.abs(b.a)-148707)<4000)
if(!park){console.log('⛔ no ① block within 4,000 m² of 148,707 — refusing to guess which is the park');process.exit(2)}
console.log(`① PARK = ring ${park.i} · ${Math.abs(park.a).toFixed(0)} m² · ${park.r.length} verts   (A21: shape.json tile #79, 148,707 m² — different index space, same object by area)`)
const STAGES=[['① proto',[park.r]],['protoCurb',tg.protoCurb],['band curb',tg.protoBands.curb],
              ['band treelawn',tg.protoBands.treelawn],['band sidewalk',tg.protoBands.sidewalk],['band lu',tg.protoBands.lu]]
for(const [name,X,Z] of JUNCTIONS){
  console.log(`\n${name}  (${X},${Z})   — every vertex within ${R} m`)
  for(const [label,rings] of STAGES){
    let maxTurn=-1, spurs=0, seen=0, at=null
    for(const r of (rings||[])){ if(r.length<4) continue
      for(let i=0;i<r.length;i++){
        if(Math.hypot(r[i][0]-X,r[i][1]-Z)>R) continue
        const t=turn(r,i); if(!t) continue
        seen++; if(t.spur) spurs++
        if(t.deg>maxTurn){maxTurn=t.deg; at=r[i]} } }
    console.log(`  ${label.padEnd(14)} ${String(seen).padStart(4)} vertices · sharpest TURN ${maxTurn<0?'—':maxTurn.toFixed(1)+'°'}${at?` at ${at.map(v=>v.toFixed(1))}`:''} · ⛔ SPURS (>165°) ${spurs}`)
  }
}
