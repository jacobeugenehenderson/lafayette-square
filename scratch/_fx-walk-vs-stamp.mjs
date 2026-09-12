// FORENSIC (read-only, throwaway). Runs on the SAME artifact the lit app reads.
import fs from 'fs'
import { sectionPassTile, sectionPassProtoTile, hasStampInquiry, cornerDump } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'lafayette-square'
const s = JSON.parse(fs.readFileSync(`public/baked/${scene}/shape.json`,'utf8'))
const design = JSON.parse(fs.readFileSync(`public/looks/${scene}/design.json`,'utf8'))
const T = s.tiles || [], cw = design.curbWidth, bc = design.blockCustoms || null
const sm = { outer:'LU', inner:'SW' }
console.log(`== ${scene}: ${T.length} tiles · cw ${cw} · authoring ${bc?'LOADED':'NULL'} ==`)
console.log(`hasStampInquiry: ${T.filter(hasStampInquiry).length}/${T.length}   iaEdge present: ${T.filter(t=>Array.isArray(t.iaEdge)&&t.iaEdge.length).length}/${T.length}`)

// ── A. WHERE DOES EACH PAINTER THINK A CORNER IS? ────────────────────────────
// stamp: ①'s iaCorner marks, on iaFull. walk: sectionPassTile mints one at each
// non-suppressed run END (run.poly[0] / [n-1]) and matches it to a fillet by
// NEAREST APEX.
const D = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
let stampPts=0, walkPts=0, matched=0, walkOrphan=0, stampOrphan=0
const orphanDist=[]
for (const t of T) {
  const sp=[]
  ;(t.iaCorner||[]).forEach((arr,r)=>(arr||[]).forEach((v,k)=>{ if(v) sp.push(t.iaFull[r][k]) }))
  const wp=[]
  for (const run of (t.runs||[])) { const p=run.poly; if(!p||p.length<2) continue; wp.push(p[0], p[p.length-1]) }
  // de-dup walk points (two runs share an end)
  const seen=new Set(), wpu=[]
  for(const p of wp){const k=`${p[0].toFixed(3)},${p[1].toFixed(3)}`; if(!seen.has(k)){seen.add(k); wpu.push(p)}}
  stampPts+=sp.length; walkPts+=wpu.length
  for (const w of wpu){ let bd=Infinity; for(const q of sp){const d=D(w,q); if(d<bd)bd=d}
    if (bd<=0.05) matched++; else { walkOrphan++; orphanDist.push(bd) } }
  for (const q of sp){ let bd=Infinity; for(const w of wpu){const d=D(w,q); if(d<bd)bd=d}; if(bd>0.05) stampOrphan++ }
}
orphanDist.sort((a,b)=>a-b)
console.log(`\nA. CORNER LOCATION — the two models disagree?`)
console.log(`   ① STAMPED corner marks (iaCorner)      : ${stampPts}`)
console.log(`   WALK's minted corner sites (run ends)  : ${walkPts}`)
console.log(`   walk site coincides with a stamp (≤5cm): ${matched}  (${(100*matched/walkPts).toFixed(1)}%)`)
console.log(`   walk sites with NO stamped corner      : ${walkOrphan}   median miss ${orphanDist.length?orphanDist[orphanDist.length>>1].toFixed(2):'-'} m`)
console.log(`   stamped corners NO walk site reaches   : ${stampOrphan}`)

// ── B. THE WALK PAINTER'S OWN DECLINE LEDGER ────────────────────────────────
cornerDump.on = true
const reasons={}; let threw=0, tilesWithDecline=0
for (const st of T) {
  cornerDump.rows.length=0
  try { sectionPassTile(st, cw, sm, bc) } catch(e){ threw++; continue }
  if (cornerDump.rows.length) tilesWithDecline++
  for (const r of cornerDump.rows) reasons[r.reason]=(reasons[r.reason]||0)+1
}
console.log(`\nB. sectionPassTile CORNER_DUMP — corners that BID and did NOT build`)
console.log(`   throws: ${threw}/${T.length} · tiles with ≥1 decline: ${tilesWithDecline}`)
for(const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`)
console.log(`   TOTAL declines: ${Object.values(reasons).reduce((a,b)=>a+b,0)}`)

// ── C. OF THE CORNERS THE WALK BIDS, HOW MANY ARE AT A STAMPED CORNER? ───────
console.log(`\nC. every corner the WALK bids, classified against ①'s stamp`)
const tally = {}
for (const st of T) {
  const sp=[]
  ;(st.iaCorner||[]).forEach((arr,r)=>(arr||[]).forEach((v,k)=>{ if(v) sp.push(st.iaFull[r][k]) }))
  cornerDump.rows.length=0
  try { sectionPassTile(st, cw, sm, bc) } catch(e){ continue }
  for (const row of cornerDump.rows) {
    let bd=Infinity; for(const q of sp){const d=D(row.p,q); if(d<bd)bd=d}
    const at = bd<=0.05 ? 'AT-a-stamped-corner' : 'NOT-a-stamped-corner'
    const key = `${at} · ${row.reason}`
    tally[key]=(tally[key]||0)+1
  }
}
for(const [k,v] of Object.entries(tally).sort((a,b)=>b[1]-a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`)

// ── D. THE SUPPRESSION PREDICATES THAT NEED REFUSED FIELDS ──────────────────
const R = T.flatMap(t=>t.runs||[])
console.log(`\nD. the walk's five suppression predicates, on this substrate`)
console.log(`   isNameTransition  reads run.roadId       — defined on ${R.filter(r=>r.roadId!=null).length}/${R.length} runs  ⇒ ${R.some(r=>r.roadId!=null)?'live':'ALWAYS FALSE'}`)
console.log(`   isThruNode        reads st.thruNodeEnds   — non-empty on ${T.filter(t=>(t.thruNodeEnds||[]).length).length}/${T.length} tiles ⇒ ${T.some(t=>(t.thruNodeEnds||[]).length)?'live':'ALWAYS FALSE'}`)
console.log(`   tipped            reads roundTipKeys/blunt— non-empty on ${T.filter(t=>(t.roundTipKeys||[]).length||(t.bluntTips||[]).length).length}/${T.length} tiles ⇒ ${T.some(t=>(t.roundTipKeys||[]).length)?'live':'ALWAYS FALSE'}`)
console.log(`   isThrough         run-ends within a tile  — needs no refused field ⇒ live`)
console.log(`   e.noPed           the rim                 — needs no refused field ⇒ live`)
console.log(`   [DEAD-END WRAP]   st.mouths               — non-empty on ${T.filter(t=>(t.mouths||[]).length).length}/${T.length} tiles`)
