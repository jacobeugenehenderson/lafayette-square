// Frontage VARIETY is dead (flat across buckets, 3 towns). Block SIZE is not:
// median area of a block carrying a hairline vs one that does not is
// 599/10,517 (LS) · 692/16,066 (HPDM) · 2,429/26,309 (altadena).
// So test the mechanism that predicts: the stack is being squeezed into a block
// that barely has room for it. Reach = 2|A|/P of the block outline (its mean
// half-width). Demand = cw + max(treelawn + sidewalk) over its frontages.
import fs from 'fs'
import { feed, buildProto } from './_proto-feed.mjs'
const sa=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
const per=r=>{let s=0;for(let i=0,n=r.length;i<n;i++){const a=r[i],b=r[(i+1)%n];s+=Math.hypot(b[0]-a[0],b[1]-a[1])}return s}
const hair=r=>r.length>=3&&((per(r)>0?2*Math.abs(sa(r))/per(r):0)<0.05||Math.abs(sa(r))<1)
for (const scene of (process.argv.slice(2).length?process.argv.slice(2):['lafayette-square'])) {
  const f=feed(scene); if(!f) continue
  const tg=buildProto(f); const B=tg.protoBandsByBlock, L=tg.protoBlockLabels
  const meas=new Map(); for(const s of (f.ribbons.streets||[])) meas.set(s.id||s.skelId, s.measure||s.baseMeasure||null)
  const cw=f.curbWidth
  const rows=[]
  for(const [k,bands] of Object.entries(B)){
    const outer=[...bands.curb,...bands.lu].filter(r=>r.length>=3&&sa(r)>0).sort((a,b)=>sa(b)-sa(a))[0]
    if(!outer) continue
    let demand=0
    for(const l of (L[k]||[])){const o=tg.protoOwners[l]; if(!o)continue
      const s=meas.get(o.skelId)?.[o.side]; if(!s)continue
      demand=Math.max(demand, cw+(s.treelawn||0)+(s.sidewalk||0))}
    const reach=2*Math.abs(sa(outer))/per(outer)      // mean half-width of the block outline
    let n=0,tot=0
    for(const rings of Object.values(bands)) for(const r of rings){if(r.length<3)continue;tot++;if(hair(r))n++}
    rows.push({k, reach:+reach.toFixed(2), demand:+demand.toFixed(2), ratio:demand>0?+(reach/demand).toFixed(2):null, hair:n, rings:tot})
  }
  const good=rows.filter(r=>r.ratio!=null)
  const buckets=[[0,1],[1,2],[2,4],[4,8],[8,1e9]]
  console.log(`\n${scene}  (curbWidth ${cw}) — ${good.length} blocks with a resolvable demand`)
  console.log('  reach / demand      blocks   rings  hairline   % of rings')
  for(const [lo,hi] of buckets){
    const s=good.filter(r=>r.ratio>=lo&&r.ratio<hi)
    if(!s.length) continue
    const rings=s.reduce((a,b)=>a+b.rings,0), h=s.reduce((a,b)=>a+b.hair,0)
    console.log(`     ${String(lo).padStart(2)} – ${hi>1e8?'∞':String(hi).padEnd(2)}        ${String(s.length).padStart(5)}  ${String(rings).padStart(6)}  ${String(h).padStart(8)}   ${(100*h/rings).toFixed(1)}%`)
  }
}
