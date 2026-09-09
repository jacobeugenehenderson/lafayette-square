// The park's OWN corner, on the park's OWN rings.
// ⛔ A node has up to four corners — one per quadrant, each a vertex of a DIFFERENT
// block's ring. "The corner at this node" is four corners. Jacob's report is about
// the PARK's, so every ring below is the park block's, reached by carried identity
// (`protoBandsByBlock`), never by proximity to the node.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const SPUR_COS = Math.cos(165 * Math.PI / 180)
const sa=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
const turn=(r,i)=>{const n=r.length,a=r[((i-1)%n+n)%n],v=r[i],b=r[(i+1)%n]
  const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1]
  const li=Math.hypot(ix,iy),lo=Math.hypot(ox,oy); if(li<1e-12||lo<1e-12) return null
  const d=(ix/li)*(ox/lo)+(iy/li)*(oy/lo)
  return { deg: Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI, spur: d<SPUR_COS, seg: li } }
const f=feed('lafayette-square'); const tg=buildProto(f)
// the park block, BY AREA (four index spaces name it; area does not move)
const key = Object.entries(tg.protoBandsByBlock).find(([k,b]) => {
  const outer=[...b.lu,...b.curb].filter(r=>r.length>=3&&sa(r)>0).sort((x,y)=>sa(y)-sa(x))[0]
  return outer && Math.abs(sa(outer)) > 100000 && Math.abs(sa(outer)) < 150000 })?.[0]
if(!key){console.log('⛔ no block with a 100–150k m² outer — refusing to guess');process.exit(2)}
const bands = tg.protoBandsByBlock[key]
const labs = tg.protoBlockLabels[key] || []
const owners=[...new Set(labs.map(l=>tg.protoOwners[l]?.skelId).filter(Boolean))]
console.log(`PARK block key ${key} · ${labs.length} frontage edges · owners: ${owners.join(', ')}`)
console.log(`  bands: ${Object.entries(bands).map(([k2,v])=>k2+' '+v.length).join(' · ')}`)
const NODES=[['Mississippi × Park',229.0,-158.9],['Mississippi × Lafayette',166.5,221.9]]
for (const [name,X,Z] of NODES) {
  console.log(`\n${name} (${X},${Z}) — the PARK's rings only`)
  for (const [label,rings] of [['curb',bands.curb],['treelawn',bands.treelawn],['sidewalk',bands.sidewalk],['lu',bands.lu]]) {
    // the park's ring vertices within 25 m of the node, in order
    let found=false
    for (const r of rings) { if(r.length<4) continue
      const idx=[]; for(let i=0;i<r.length;i++) if(Math.hypot(r[i][0]-X,r[i][1]-Z)<=25) idx.push(i)
      if(!idx.length) continue
      found=true
      const ts=idx.map(i=>turn(r,i)).filter(Boolean)
      const spurs=ts.filter(t=>t.spur).length
      const sharp=ts.reduce((a,b)=>a.deg>b.deg?a:b,{deg:-1})
      // FILLET TEST: a corner that was eased is many small turns on short segments.
      const arcish=ts.filter(t=>t.deg>1 && t.deg<25 && t.seg<1.5).length
      console.log(`  ${label.padEnd(9)} ${String(idx.length).padStart(3)} verts · sharpest ${sharp.deg.toFixed(1)}° · spurs ${spurs} · arc-like samples (turn 1–25°, seg<1.5 m) ${arcish}`)
    }
    if(!found) console.log(`  ${label.padEnd(9)} — the park has NO ring within 25 m of this node`)
  }
}
