import { feed, buildProto } from './_proto-feed.mjs'
import { resolvePedDepths } from '../src/lib/tileGround.js'
const roadOf=id=>String(id??'').replace(/-\d+$/,'')
const P=[435.3,-155.9], R=25
const f=feed('lafayette-square'); const T=buildProto(f,{protoArtifact:true}).protoShapeTiles
for (const [ti,t] of T.entries()){
  for (const [ri,ring] of (t.iaFull||[]).entries()){
    if(!ring.some(v=>Math.hypot(v[0]-P[0],v[1]-P[1])<R)) continue
    const n=ring.length, stp=t.iaStamp[ri]||[], cor=t.iaCorner?.[ri]||[]
    console.log(`\n── tile ${ti} ring ${ri} (${n} pts) · lu=${t.lu} · fillets ${(t.fillets||[]).length}`)
    const KP=x=>`${x[0].toFixed(6)},${x[1].toFixed(6)}`
    const ix=new Map(); for(let q=0;q<n;q++){const k=KP(ring[q]); if(!ix.has(k)) ix.set(k,q)}
    const arcV=new Set()
    for(const fl of (t.fillets||[])){const a=ix.get(KP(fl.tA)),b=ix.get(KP(fl.tB)); if(a==null||b==null) continue
      const fwd=(b-a+n)%n,bwd=(a-b+n)%n; const [s0,len]= fwd<=bwd?[a,fwd]:[b,bwd]
      for(let k=0;k<=len;k++) arcV.add((s0+k)%n)}
    for(let q=0;q<n;q++) if(cor[q]) console.log(`   ⭐ corner at v${q} (${ring[q][0].toFixed(1)},${ring[q][1].toFixed(1)}) — ${arcV.has(q)?'inside a fillet arc (has an extent)':'⛔ NO FILLET — the pad has NO EXTENT, one edge wide'}`)
    let last=null
    for(let q=0;q<n;q++){
      if(Math.hypot(ring[q][0]-P[0],ring[q][1]-P[1])>R) continue
      const r=stp[q]
      const o=r==null?null:t.runs[r]
      const key=o?`${roadOf(o.skelId)}|${o.side}`:'—'
      const full=o?`${o.skelId}|${o.side}|${o.segOrd}`:'NO OWNER'
      const d=o?resolvePedDepths(o.baseMeasure,o.side,f.blockCustoms?.[o.skelId]?.[o.side]?.[o.segOrd]||null):null
      const arr=d?`${d.hasTL?'TL':'SW'} tl${d.tl.toFixed(2)} sw${d.sw.toFixed(2)}`:''
      if(key!==last) console.log(`   v${String(q).padStart(3)} (${ring[q][0].toFixed(1)},${ring[q][1].toFixed(1)})  ${cor[q]?'⭐CORNER':'        '}  ${full.padEnd(34)} ${arr}`)
      last=key
    }
  }
}
