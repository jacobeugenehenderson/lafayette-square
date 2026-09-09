// Does block ROOM predict hairlines? Two demands, side by side, because the
// first cut used the wrong one and the correction is the whole point.
//
// ⛔ `demand` must be what the map PAINTS, not what the data RECORDS.
//   demandData    = curbWidth + measure[side].treelawn + .sidewalk   ← the RAW fields
//   demandPainted = curbWidth + resolvePedDepths(...).tl + .sw       ← the SHIPPED resolver
// The raw fields are only the authored override (`tileGround.js:6698`). My first
// cut used them, which is the third instance of that trap in one session — the
// other two are in the commit record (`499eaa1a`). Both are printed here so the
// difference is visible rather than asserted.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'
const sa=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
const per=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=Math.hypot(b[0]-a[0],b[1]-a[1])}return s}
const hair=r=>r.length>=3&&((per(r)>0?2*Math.abs(sa(r))/per(r):0)<0.05||Math.abs(sa(r))<1)
const BUCKETS=[[0,1],[1,2],[2,4],[4,8],[8,1e9]]
for (const scene of (process.argv.slice(2).length?process.argv.slice(2):['lafayette-square'])) {
  const f=feed(scene); if(!f) continue
  const tg=buildProto(f); const B=tg.protoBandsByBlock, L=tg.protoBlockLabels
  if(!B||!L){console.log(`⛔ ${scene}: fields absent — NOT measured`);continue}
  const base=new Map(); for(const s of (f.ribbons.streets||[])) base.set(s.id||s.skelId, s.measure||s.baseMeasure||null)
  const bcOf=(id,side,ord)=>f.blockCustoms?.[id]?.[side]?.[ord]||null
  const cw=f.curbWidth
  const rows=[]
  for(const [k,bands] of Object.entries(B)){
    const outer=[...bands.curb,...bands.lu].filter(r=>r.length>=3&&sa(r)>0).sort((a,b)=>sa(b)-sa(a))[0]
    if(!outer) continue
    let dData=0, dPaint=0
    for(const l of (L[k]||[])){
      const o=tg.protoOwners[l]; if(!o)continue
      const mz=base.get(o.skelId); const s=mz?.[o.side]; if(!s)continue
      dData=Math.max(dData, cw+(s.treelawn||0)+(s.sidewalk||0))
      const d=resolvePedDepths(mz, o.side, bcOf(o.skelId,o.side,o.segOrd))
      dPaint=Math.max(dPaint, cw+(d.tl||0)+(d.sw||0))
    }
    if(!(dData>0&&dPaint>0)) continue
    const reach=2*Math.abs(sa(outer))/per(outer)
    let n=0,tot=0
    for(const rings of Object.values(bands)) for(const r of rings){if(r.length<3)continue;tot++;if(hair(r))n++}
    rows.push({reach, dData, dPaint, n, tot, area:Math.abs(sa(outer))})
  }
  const spread=(a)=>{const v=a.slice().sort((x,y)=>x-y);return `min ${v[0].toFixed(2)} · med ${v[v.length>>1].toFixed(2)} · max ${v[v.length-1].toFixed(2)}`}
  console.log(`\n${scene}  (${f.slots} authored slots) · ① SOURCE: ${tg.protoSource}`)
  console.log(`  ${rows.length} blocks · demand from DATA:    ${spread(rows.map(r=>r.dData))} m`)
  console.log(`  ${rows.length} blocks · demand PAINTED:      ${spread(rows.map(r=>r.dPaint))} m`)
  for (const [label,key] of [['reach / demand (DATA — the wrong one, kept to show the difference)','dData'],
                             ['reach / demand (PAINTED — the map)','dPaint']]) {
    console.log(`  ${label}`)
    for(const [lo,hi] of BUCKETS){
      const s=rows.filter(r=>r.reach/r[key]>=lo && r.reach/r[key]<hi); if(!s.length) continue
      const rings=s.reduce((a,b)=>a+b.tot,0), h=s.reduce((a,b)=>a+b.n,0)
      console.log(`     ${String(lo).padStart(2)} – ${hi>1e8?'∞':String(hi).padEnd(2)}   ${String(s.length).padStart(5)} blocks ${String(rings).padStart(6)} rings ${String(h).padStart(5)} hairline  ${(100*h/rings).toFixed(1)}%`)
    }
  }
}
