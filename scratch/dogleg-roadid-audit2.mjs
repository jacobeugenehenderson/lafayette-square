// Refined: classify same-name non-unioned pairs against ALL FOUR derive.js gates.
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const DOT = -0.6
const vk = p => p[0].toFixed(2)+','+p[1].toFixed(2)
const nrm = (x,z)=>{const L=Math.hypot(x,z)||1;return [x/L,z/L]}
const isCwR = r => /^carriageway/.test(r||'')
const ends = new Map()
for (const s of R.streets) {
  const p=s.points; if(!p||p.length<2) continue
  for (const e of ['start','end']) {
    const [nd,ax] = e==='start'?[p[0],p[1]]:[p[p.length-1],p[p.length-2]]
    const k=vk(nd); if(!ends.has(k)) ends.set(k,[])
    ends.get(k).push({ skelId:s.skelId, name:s.name||'?', roadId:s.roadId,
      corr:s.phase?.corridorName||s.name, role:s.phase?.role||'', pairKey:s.phase?.pairKey||null,
      out:nrm(ax[0]-nd[0],ax[1]-nd[1]) })
  }
}
const buckets={}
const survivors=[]
for (const [k,list] of ends) for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++){
  const P=list[i],Q=list[j]
  if (P.skelId===Q.skelId) continue
  if (!(P.name===Q.name && P.name!=='?')) continue
  if (P.roadId!=null && P.roadId===Q.roadId) continue      // unioned fine
  const dot=P.out[0]*Q.out[0]+P.out[1]*Q.out[1]
  const turn=180-Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI
  let gate
  if (P.corr!==Q.corr) gate='1-corridorName'
  else if (P.pairKey && P.pairKey===Q.pairKey && P.role!==Q.role) gate='2-dividedPair(intended)'
  else if (isCwR(P.role)!==isCwR(Q.role)) gate='3-cw-vs-spine(intended)'
  else if (dot>DOT) gate='4-ANGLE'
  else gate='5-UNEXPLAINED'
  buckets[gate]=(buckets[gate]||0)+1
  if (gate==='4-ANGLE'||gate==='5-UNEXPLAINED') survivors.push({k,name:P.name,a:P.skelId,b:Q.skelId,turn:+turn.toFixed(1),dot:+dot.toFixed(3),gate,roleA:P.role||'-',roleB:Q.role||'-',deg:list.length})
}
console.log('gate that dropped each same-name non-unioned pair:'); console.log(buckets)
console.log('\n--- the ones NOT explained by the divided-road gates ---')
survivors.sort((a,b)=>a.turn-b.turn)
for(const s of survivors) console.log(`  turn=${String(s.turn).padStart(5)}deg dot=${String(s.dot).padStart(6)} deg${s.deg} ${s.gate}  ${s.name}: ${s.a} × ${s.b}  roles=${s.roleA}/${s.roleB}  node=${s.k}`)
