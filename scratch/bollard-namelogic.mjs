import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const R=JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const turn=(a,b,c)=>{let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
// 1. named-street fragmentation
const byName={}
for(const s of R.streets){const n=(s.name||'').trim();if(!n)continue;(byName[n]||(byName[n]=[])).push(s)}
const frag=Object.entries(byName).filter(([n,a])=>a.length>1)
console.log('Named streets fragmented into >1 segment:',frag.length,'/',Object.keys(byName).length)
// 2. within-name dog-legs: a node where TWO segments of the SAME name meet (deg-2-ish), with a kink
// build node -> incident (street, endpoint-dir)
const atNode={}
for(const s of R.streets){const p=s.points;if(!p)continue;for(const [k,idx] of [['0',0],['1',p.length-1]]){const key=jKey(p[idx][0],p[idx][1]);(atNode[key]||(atNode[key]=[])).push({s,idx})}}
let sameNameJoins=0, sameNameKinks=0
for(const key in atNode){const inc=atNode[key];if(inc.length!==2)continue
  const [a,b]=inc;if((a.s.name||'')!==(b.s.name||'')||!a.s.name)continue
  sameNameJoins++
  // angle of the join: direction of A leaving node vs B leaving node
  const pa=a.s.points, pb=b.s.points
  const va=pa[a.idx], na=pa[a.idx===0?1:pa.length-2]
  const vb=pb[b.idx], nb=pb[b.idx===0?1:pb.length-2]
  const t=turn(na,va,nb) // straight-through = ~180 here? compute deviation
  const dirA=[na[0]-va[0],na[1]-va[1]], dirB=[nb[0]-vb[0],nb[1]-vb[1]]
  const la=Math.hypot(...dirA),lb=Math.hypot(...dirB)
  const dot=(dirA[0]*dirB[0]+dirA[1]*dirB[1])/(la*lb)
  const between=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI // 180=straight through, <180=kink
  if(between<165)sameNameKinks++
}
console.log('Same-name segment joins (deg-2, two same-named segs meet):',sameNameJoins)
console.log('  ...of those, with a KINK >15° (within-name dog-leg, name-logic could straighten):',sameNameKinks)
// 3. the 3 circled junctions: names meeting
console.log('\nThe 3 circles — what named streets meet:')
const CIRC=[['A',-42.5,188.9],['B',-48.0,-203.9],['C',-177.5,-78.7]]
for(const [lab,x,z] of CIRC){const key=jKey(x,z);const inc=(atNode[key]||[]).map(e=>e.s.name||e.s.skelId)
  console.log('  '+lab+' ['+x+','+z+']: '+[...new Set(inc)].join(' + ')+(new Set(inc).size===1?'  (SAME-name → possible artifact)':'  (different names → real intersection)'))
}

console.log('\n=== the 5 within-name dog-legs (location, street, kink angle) ===')
for(const key in atNode){const inc=atNode[key];if(inc.length!==2)continue
  const [a,b]=inc;if((a.s.name||'')!==(b.s.name||'')||!a.s.name)continue
  const pa=a.s.points,pb=b.s.points
  const va=pa[a.idx],na2=pa[a.idx===0?1:pa.length-2]
  const vb=pb[b.idx],nb2=pb[b.idx===0?1:pb.length-2]
  const dirA=[na2[0]-va[0],na2[1]-va[1]],dirB=[nb2[0]-vb[0],nb2[1]-vb[1]]
  const la=Math.hypot(...dirA),lb=Math.hypot(...dirB)
  const between=Math.acos(Math.max(-1,Math.min(1,(dirA[0]*dirB[0]+dirA[1]*dirB[1])/(la*lb))))*180/Math.PI
  if(between<165)console.log('  ['+va[0].toFixed(1)+','+va[1].toFixed(1)+']  '+a.s.name+'  kink='+(180-between).toFixed(0)+'° off-straight')
}
// does welding same-name fragments reduce staggers? count nodes that are ONLY same-name deg-2 joins (weld targets)
console.log('\nSame-name deg-2 joins are weld-collapsible nodes (21). Fragmented streets to weld: 35.')
