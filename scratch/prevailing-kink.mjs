// Prevailing-direction test: for each chain endpoint landing on a multi-way node,
// compare the TIP heading (node-adjacent segment) to the BODY heading (prevailing,
// sampled further back). Discriminate ARTIFACT kink (straight body + tip deviates)
// from REAL curve (body itself is turning).
import fs from 'fs'
const hd=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])
const angDiff=(h1,h2)=>{let d=Math.abs(h1-h2)*180/Math.PI;if(d>180)d=360-d;return d}
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])

// heading over roughly `dist` meters from the tip end, walking inward
function headingAt(pts, fromStart, backFrom, backTo){
  // returns heading of the chord between arc-length backFrom..backTo meters from the tip
  const seq = fromStart ? pts : [...pts].reverse()  // seq[0] = tip
  let acc=0, pA=null, pB=null
  for(let i=0;i<seq.length-1;i++){
    const segL=len(seq[i],seq[i+1])
    const before=acc, after=acc+segL
    if(pA===null && after>=backFrom) pA = seq[i]  // near end of the body window
    if(pB===null && after>=backTo){ pB = seq[i+1]; break }
    acc=after
  }
  if(!pA||!pB) { pA=seq[Math.min(1,seq.length-1)]; pB=seq[seq.length-1] }
  // heading points INWARD (tip -> body); flip to compare as "incoming"
  return hd(pB,pA)
}

function audit(path,label,detailNode){
  const R=JSON.parse(fs.readFileSync(path,'utf8'))
  const streets=(R.streets||[]).filter(s=>s.points&&s.points.length>=3&&!s.gradeSeparated)
  const vk=p=>Math.round(p[0]/0.9)+','+Math.round(p[1]/0.9)
  // node incidence: endpoints only
  const nodes=new Map()
  for(const s of streets){const p=s.points
    for(const [end,tip] of [['s',p[0]],['e',p[p.length-1]]]){
      const k=vk(tip); if(!nodes.has(k))nodes.set(k,[]); nodes.get(k).push({s,fromStart:end==='s',tip})
    }}
  let artifact=0, real=0, straight=0, nodesWithKink=new Set()
  const detail=[]
  for(const [k,inc] of nodes){
    if(inc.length<2) continue
    for(const {s,fromStart,tip} of inc){
      const p=s.points
      const hTip  = headingAt(p, fromStart, 0, 6)     // node-adjacent ~6m
      const hBody = headingAt(p, fromStart, 15, 40)   // prevailing, 15-40m back
      const hFar  = headingAt(p, fromStart, 40, 70)   // even further, to test body-straightness
      const kink = angDiff(hTip,hBody)
      const bodyCurve = angDiff(hBody,hFar)            // is the body itself turning?
      let cls
      if(kink < 6) { straight++; cls='straight' }
      else if(bodyCurve < 6) { artifact++; cls='ARTIFACT (straight body, tip kinks '+kink.toFixed(0)+'°)'; nodesWithKink.add(k) }
      else { real++; cls='real-curve (body turns '+bodyCurve.toFixed(0)+'°)' }
      if(detailNode && len(tip,detailNode)<4) detail.push({name:s.name,skelId:s.skelId,kink:+kink.toFixed(1),bodyCurve:+bodyCurve.toFixed(1),cls})
    }
  }
  console.log(`\n===== ${label} =====`)
  console.log(`  chain-ends at multi-nodes:  ${straight+artifact+real}`)
  console.log(`  straight (no kink):         ${straight}`)
  console.log(`  ARTIFACT kink (fortifiable):${artifact}   across ${nodesWithKink.size} nodes`)
  console.log(`  real curve (leave alone):   ${real}`)
  if(detail.length){ console.log(`  --- detail @ node [${detailNode}] ---`)
    for(const d of detail) console.log(`     ${(d.name||d.skelId).padEnd(22)} kink=${d.kink}° bodyCurve=${d.bodyCurve}° → ${d.cls}`) }
}
audit('src/data/ribbons.json','LAFAYETTE SQUARE', null)
audit('cartograph/data/hipointe-demun/clean/ribbons.json','HI-POINTE / DEMUN', [-4.4,931.3])
