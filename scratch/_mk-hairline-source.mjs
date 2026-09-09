// Where do the 88% come from? Hairlines on ordinary stack blocks.
// A band is `difference(outer offset, inner offset)`; a hairline is where the two
// nearly coincide. Two candidate correlates, both read off carried identity:
//   (1) the block's frontage VARIETY — how many distinct facing measures it carries
//   (2) the block's own size / edge count
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const sa=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
const per=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=Math.hypot(b[0]-a[0],b[1]-a[1])}return s}
const hair=r=>r.length>=3&&((per(r)>0?2*Math.abs(sa(r))/per(r):0)<0.05||Math.abs(sa(r))<1)
for (const scene of (process.argv.slice(2).length?process.argv.slice(2):['lafayette-square'])) {
  const f=feed(scene); if(!f) continue
  const tg=buildProto(f); const B=tg.protoBandsByBlock, L=tg.protoBlockLabels
  if(!B||!L){console.log('⛔ '+scene+': fields absent — NOT measured');continue}
  const meas=new Map(); for(const s of (f.ribbons.streets||[])) meas.set(s.id||s.skelId, s.measure||s.baseMeasure||null)
  const rows=[]
  for(const [k,bands] of Object.entries(B)){
    const tri=new Set(), streets=new Set()
    for(const l of (L[k]||[])){const o=tg.protoOwners[l]; if(!o)continue
      const s=meas.get(o.skelId)?.[o.side]; if(!s)continue
      tri.add(`${s.pavementHW}|${s.treelawn}|${s.sidewalk}`); streets.add(o.skelId)}
    if(!tri.size) continue
    let n=0, tot=0
    for(const rings of Object.values(bands)) for(const r of rings){ if(r.length<3)continue; tot++; if(hair(r))n++ }
    const area=Math.abs(sa([...bands.lu,...bands.curb].filter(r=>r.length>=3&&sa(r)>0).sort((a,b)=>sa(b)-sa(a))[0]||[[0,0],[0,0],[0,0]]))
    rows.push({k, variety:tri.size, streets:streets.size, edges:(L[k]||[]).length, rings:tot, hairlines:n, area:+area.toFixed(0)})
  }
  const withH=rows.filter(r=>r.hairlines>0), without=rows.filter(r=>r.hairlines===0)
  const med=(a,f)=>{const v=a.map(f).sort((x,y)=>x-y);return v.length?v[Math.floor(v.length/2)]:null}
  console.log(`\n${scene}: ${rows.length} blocks · ${withH.length} carry a hairline · ${rows.reduce((s,r)=>s+r.hairlines,0)} hairlines total`)
  for (const [name,set] of [['blocks WITH a hairline',withH],['blocks WITHOUT',without]])
    console.log(`  ${name.padEnd(24)} n=${String(set.length).padStart(4)}  median variety ${med(set,r=>r.variety)} · streets ${med(set,r=>r.streets)} · edges ${med(set,r=>r.edges)} · rings ${med(set,r=>r.rings)} · area ${med(set,r=>r.area)} m²`)
  // hairlines per ring, bucketed by frontage variety
  const buck={}
  for(const r of rows){const b=Math.min(r.variety,6); (buck[b]||=(buck[b]={blocks:0,rings:0,hair:0})); buck[b].blocks++; buck[b].rings+=r.rings; buck[b].hair+=r.hairlines}
  console.log('  by frontage VARIETY (distinct facing pavementHW|treelawn|sidewalk on the block):')
  for(const b of Object.keys(buck).sort((a,c)=>a-c)){const v=buck[b]
    console.log(`     ${b==6?'6+':b} distinct  ${String(v.blocks).padStart(4)} blocks  ${String(v.rings).padStart(5)} rings  ${String(v.hair).padStart(4)} hairline  = ${(100*v.hair/v.rings).toFixed(1)}% of rings`)}
}
