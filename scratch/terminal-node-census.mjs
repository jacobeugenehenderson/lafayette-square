// FULL CENSUS: every multi-way node on LS + HPDM, classified by the terminal sweep.
// identity = same name + near-continuous (component-connected @ weld tol).
// At each node: for each identity present, is the node a TIP of that identity's
// graph (TERMINAL) or interior (THROUGH)?  Then:
//   FALSE-CORNER RISK = a node the CURRENT code would corner (>=2 distinct roadIds
//   meet) but the sweep says exactly ONE identity is THROUGH + others TERMINAL
//   (a T/dogleg where the through-road should NOT corner against the stem).
import fs from 'fs'
const Q=0.5, qk=p=>Math.round(p[0]/Q)+','+Math.round(p[1]/Q)
const NK=0.9, nodeK=p=>Math.round(p[0]/NK)+','+Math.round(p[1]/NK) // node bucket

function build(path){
  const R=JSON.parse(fs.readFileSync(path,'utf8'))
  const streets=(R.streets||[]).filter(s=>s.points&&s.points.length>=2&&!s.gradeSeparated)
  // identity = name+connected component
  const nameFam=new Map()
  for(const s of streets){const id=(s.name&&s.name.trim())||('__'+s.skelId);(nameFam.get(id)||nameFam.set(id,[]).get(id)).push(s)}
  // assign each street an identityId = name#component
  const idOfStreet=new Map()   // skelId -> identityId
  const idGraph=new Map()      // identityId -> {deg:Map, tips:Set}
  for(const [name,pieces] of nameFam){
    const deg=new Map(),adj=new Map()
    const link=(a,b)=>{(adj.get(a)||adj.set(a,new Set()).get(a)).add(b)}
    for(const s of pieces){const p=s.points;for(let i=0;i<p.length-1;i++){const a=qk(p[i]),b=qk(p[i+1]);if(a===b)continue;deg.set(a,(deg.get(a)||0)+1);deg.set(b,(deg.get(b)||0)+1);link(a,b);link(b,a)}}
    // components
    const seen=new Set();let c=0
    const vertComp=new Map()
    for(const v of deg.keys()){if(seen.has(v))continue;const cid=`${name}#${c++}`;const st=[v];seen.add(v);const verts=[]
      while(st.length){const x=st.pop();verts.push(x);vertComp.set(x,cid);for(const y of (adj.get(x)||[]))if(!seen.has(y)){seen.add(y);st.push(y)}}
      const tips=new Set(verts.filter(v=>deg.get(v)===1))
      idGraph.set(cid,{tips, isRing: tips.size===0})
    }
    // map streets to component ids (by their first vertex)
    for(const s of pieces){const p=s.points; const cid=vertComp.get(qk(p[0]))||vertComp.get(qk(p[1])); idOfStreet.set(s.skelId,{cid,name})}
  }
  // collect incidence at each node
  const nodes=new Map() // nodeKey -> {coord, ident:Map(cid->{name,tip:bool,skelIds:Set})}
  for(const s of streets){
    const p=s.points; const meta=idOfStreet.get(s.skelId); if(!meta)continue
    const g=idGraph.get(meta.cid)
    for(let i=0;i<p.length;i++){
      const isTip = g.tips.has(qk(p[i]))
      const isEndpt=(i===0||i===p.length-1)
      // only register a node presence at endpoints OR where another street shares this vertex
      const nk=nodeK(p[i])
      if(!nodes.has(nk)) nodes.set(nk,{coord:p[i],ident:new Map()})
      const N=nodes.get(nk)
      if(!N.ident.has(meta.cid)) N.ident.set(meta.cid,{name:meta.name,tipHere:false,interiorHere:false,skelIds:new Set(),isRing:g.isRing})
      const rec=N.ident.get(meta.cid); rec.skelIds.add(s.skelId)
      if(isTip && isEndpt) rec.tipHere=true
      if(!isEndpt) rec.interiorHere=true
      // an endpoint that is NOT a global tip = it's a fragmentation seam mid-road => interior-ish
      if(isEndpt && !isTip) rec.interiorHere=true
    }
  }
  return {nodes}
}

function census(path,label){
  const {nodes}=build(path)
  let multi=0, cleanCross=0, TdogClean=0, ringNode=0, ambiguous=0
  const targets=[]
  for(const [nk,N] of nodes){
    const ids=[...N.ident.values()]
    if(ids.length<2) continue           // not a real multi-identity node
    multi++
    const through = ids.filter(r=>r.interiorHere && !r.tipHere)
    const terminal = ids.filter(r=>r.tipHere && !r.interiorHere)
    const ring = ids.filter(r=>r.isRing)
    if(ring.length){ ringNode++; continue }
    if(through.length===1 && terminal.length>=1){
      TdogClean++   // classic T/dogleg: ONE road through, others tee in as stems
      targets.push({coord:N.coord, through:through[0].name, stems:terminal.map(t=>t.name)})
    } else if(through.length>=2 && terminal.length===0){
      cleanCross++  // genuine crossing of through-roads (4-way): corners are block-adjacency, fine
    } else {
      ambiguous++
    }
  }
  console.log(`\n===== ${label} =====`)
  console.log(`  multi-identity nodes:              ${multi}`)
  console.log(`  clean crossing (≥2 through):       ${cleanCross}`)
  console.log(`  T / dogleg (1 through + stem[s]):  ${TdogClean}   ← the sweep makes these unambiguous`)
  console.log(`  ring-touching (roundabout):        ${ringNode}`)
  console.log(`  ambiguous (needs a look):          ${ambiguous}`)
  console.log(`  --- sample T/dogleg targets (through-road ⟂ stem) ---`)
  for(const t of targets.slice(0,12))
    console.log(`    [${t.coord.map(v=>v.toFixed(1)).join(',')}]  THROUGH=${t.through}  STEM=${t.stems.join('/')}`)
  if(targets.length>12) console.log(`    …+${targets.length-12} more`)
}
census('src/data/ribbons.json','LAFAYETTE SQUARE')
census('cartograph/data/hipointe-demun/clean/ribbons.json','HI-POINTE / DEMUN')
