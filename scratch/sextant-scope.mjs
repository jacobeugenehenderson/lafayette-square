// Sextant scope sweep — every plain deg-3 T where the through-avenue carries a
// per-fe pavementHW step that fires a THRU blend window (the no-mouth dogleg).
import { readFileSync } from 'fs'
import { resolveChainSegmentation } from '../src/lib/buildBlockGeometryV2.js'

const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design  = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bc = design.blockCustoms || null
const streets = ribbons.streets
const jm = ribbons.junctionMap
const seg = resolveChainSegmentation(streets)
const byId = new Map(streets.map((s, i) => [s.skelId || s.name, i]))
const ixIdxsByStreet = streets.map(s => { const n = s?.points?.length||0; return [...(seg.get(s)||[])].filter(i=>i>0&&i<n-1).sort((a,b)=>a-b) })
const segOrdAtVertex = (idx, lower) => { let so=0; for(const i of (ixIdxsByStreet[idx]||[])) if(i<=lower) so++; return so }
const baseHW = (idx, side) => Math.max(0, streets[idx]?.measure?.[side]?.pavementHW||0)
const feWidthAt = (idx, side, so) => { const base=baseHW(idx,side); if(!bc) return base; const sk=streets[idx].skelId||streets[idx].name; const c=sk?bc[sk]?.[side]?.[so]:null; return (c&&Number.isFinite(c.pavementHW))?Math.max(0,c.pavementHW):base }
const D = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])

// plain nodes = E3 constructs nothing (no continuity/deTaper/apron)
const plain = jm.nodes.filter(n => !(n.continuity?.length || n.deTaper?.length || n.apron))
let total = 0, fired = [], bigKinks = []
for (const nd of plain) {
  const thru = (nd.legs||[]).find(l => l.end === 'through')
  if (!thru) continue
  const idx = byId.get(thru.chain); if (idx==null) continue
  const av = streets[idx]
  let vi=-1,bd=1e9; av.points.forEach((p,i)=>{const d=D(p,nd.at); if(d<bd){bd=d;vi=i}})
  if (vi<=0 || vi>=av.points.length-1) continue
  const a=av.points[vi-1],v=av.points[vi],b=av.points[vi+1]
  const cdx=b[0]-a[0],cdz=b[1]-a[1],cL=Math.hypot(cdx,cdz)||1
  const kink=Math.abs(((v[0]-a[0])*cdz-(v[1]-a[1])*cdx)/cL)
  for (const side of ['left','right']) {
    const wA=feWidthAt(idx,side,segOrdAtVertex(idx,vi-1)), wB=feWidthAt(idx,side,segOrdAtVertex(idx,vi))
    const dw=Math.abs(wA-wB)
    if (dw<0.02 && kink<0.3) continue
    if (!(Math.min(wA,wB)>0.01)) continue
    total++
    const W = Math.min(8, Math.max(2, 1.7*dw, 2.5*kink))
    const blendDeg = Math.atan(dw/(2*W))*180/Math.PI
    const rec = { chain: thru.chain, at: nd.at, side, dw:+dw.toFixed(2), kink:+kink.toFixed(3), W:+W.toFixed(2), blendDeg:+blendDeg.toFixed(1) }
    fired.push(rec)
    if (dw > 1.0) bigKinks.push(rec)
  }
}
console.log(`plain through-nodes: ${plain.filter(n=>(n.legs||[]).some(l=>l.end==='through')).length}`)
console.log(`THRU stations fired (per chain|side, dw>=0.02 or kink>=0.3): ${total}`)
console.log(`\n-- the visible doglegs (dw > 1.0 m, the worst) --`)
bigKinks.sort((a,b)=>b.dw-a.dw)
for (const r of bigKinks) console.log(`  dw=${r.dw}m blend~${r.blendDeg}deg  ${r.chain} ${r.side} @ [${r.at}]  W=${r.W} kink=${r.kink}`)
console.log(`\n-- distribution of dw --`)
const buckets={'0.02-0.25':0,'0.25-0.5':0,'0.5-1':0,'1-2':0,'2+':0}
for(const r of fired){const d=r.dw; if(d<0.25)buckets['0.02-0.25']++; else if(d<0.5)buckets['0.25-0.5']++; else if(d<1)buckets['0.5-1']++; else if(d<2)buckets['1-2']++; else buckets['2+']++}
console.log('  '+JSON.stringify(buckets))
// also pure-kink (centerline) doglegs with no width step
const kinkOnly = fired.filter(r=>r.dw<0.02 && r.kink>=0.3)
console.log(`\n-- centerline-kink-only stations (dw~0, kink>=0.3): ${kinkOnly.length}`)
for(const r of kinkOnly.slice(0,10)) console.log(`  kink=${r.kink}m ${r.chain} ${r.side} @ [${r.at}]`)
