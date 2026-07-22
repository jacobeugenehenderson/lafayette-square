// Does the roadId union fire at LS's multi-terminal nodes?
// Hypothesis: two chains of the SAME road meeting at a node fail to union
// when the turn exceeds ~53deg (DOT_CONTINUES=-0.6) -> cornerAt mints a FALSE corner.
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const DOT_CONTINUES = -0.6
const vk = p => p[0].toFixed(2)+','+p[1].toFixed(2)
const nrm = (x,z) => { const L=Math.hypot(x,z)||1; return [x/L,z/L] }

const ends = new Map()
for (const s of R.streets) {
  const p = s.points; if (!p || p.length<2) continue
  for (const e of ['start','end']) {
    const [nd,ax] = e==='start' ? [p[0],p[1]] : [p[p.length-1],p[p.length-2]]
    const k = vk(nd)
    if (!ends.has(k)) ends.set(k,[])
    ends.get(k).push({ skelId:s.skelId, name:s.name||'(unnamed)', roadId:s.roadId,
      corr:s.phase?.corridorName||s.name, out:nrm(ax[0]-nd[0],ax[1]-nd[1]), nd })
  }
}

const flags = []
for (const [k,list] of ends) {
  if (list.length < 2) continue
  for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++) {
    const P=list[i], Q=list[j]
    if (P.skelId===Q.skelId) continue
    const dot = P.out[0]*Q.out[0]+P.out[1]*Q.out[1]
    const turn = 180 - Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI
    const sameName = P.name===Q.name && P.name!=='(unnamed)'
    const sameCorr = P.corr===Q.corr
    const unioned = P.roadId!=null && P.roadId===Q.roadId
    // the interesting class: SAME road by name, but roadId did NOT unify
    if (sameName && !unioned) {
      flags.push({ k, name:P.name, a:P.skelId, b:Q.skelId, ra:P.roadId, rb:Q.roadId,
        dot:+dot.toFixed(3), turn:+turn.toFixed(1), sameCorr, deg:list.length,
        gate: !sameCorr ? 'CORRIDOR-NAME' : (dot > DOT_CONTINUES ? 'ANGLE (dot>-0.6)' : 'other') })
    }
  }
}
flags.sort((a,b)=>b.turn-a.turn)
console.log(`LS: ${R.streets.length} streets, ${ends.size} nodes`)
console.log(`SAME-NAME pairs whose roadId did NOT union: ${flags.length}\n`)
const byGate = {}
for (const f of flags) byGate[f.gate]=(byGate[f.gate]||0)+1
console.log('dropped by gate:', byGate, '\n')
for (const f of flags) {
  console.log(`  turn=${String(f.turn).padStart(5)}deg dot=${String(f.dot).padStart(6)} deg${f.deg}  ${f.name}`)
  console.log(`      ${f.a} (road=${f.ra})  ×  ${f.b} (road=${f.rb})   node=${f.k}   GATE=${f.gate}`)
}
