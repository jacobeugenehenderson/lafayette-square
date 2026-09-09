// What IS the island? At a point, list every ring in every collection that
// contains it or sits near it. No hypothesis — just what exists there.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const [X, Z, R] = process.argv.slice(2).map(Number)
const f = feed('lafayette-square'); const tg = buildProto(f)
const m = (r) => { let a=0,p=0,cx=0,cy=0
  for (let i=0,n=r.length;i<n;i++){const u=r[i],v=r[(i+1)%n],cr=u[0]*v[1]-v[0]*u[1];a+=cr;p+=Math.hypot(v[0]-u[0],v[1]-u[1]);cx+=(u[0]+v[0])*cr;cy+=(u[1]+v[1])*cr}
  a/=2; return {a,p,w:p>0?2*Math.abs(a)/p:0,C:Math.abs(a)>1e-9?[cx/(6*a),cy/(6*a)]:r[0]} }
const inR=(pt,g)=>{let o=false;for(let i=0,j=g.length-1;i<g.length;j=i++){const a=g[i],b=g[j]
  if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])o=!o}return o}
const COLL = { '①': tg.proto, asphalt: tg.asphalt, curbTop: tg.curb, ...tg.protoBands }
for (const [name, rings] of Object.entries(COLL)) {
  const near = []
  ;(rings||[]).forEach((r,i)=>{ if(r.length<3) return
    const M=m(r); if (Math.hypot(M.C[0]-X, M.C[1]-Z) > R) return
    near.push({ i, area:+Math.abs(M.a).toFixed(1), sign: M.a>0?'+':'-', w:+M.w.toFixed(2), verts:r.length,
                at:M.C.map(v=>+v.toFixed(1)), containsPt: inR([X,Z], r) }) })
  near.sort((a,b)=>a.area-b.area)
  if (near.length) { console.log(`\n${name}: ${near.length} ring(s) centred within ${R} m`)
    for (const n of near.slice(0,10)) console.log('  ', JSON.stringify(n)) }
}
// compound-path containment of the point in ①
let odd=false; for(const r of tg.proto) if(r.length>=3&&inR([X,Z],r)) odd=!odd
console.log(`\npoint ${X},${Z}: even-odd inside ① = ${odd}`)
