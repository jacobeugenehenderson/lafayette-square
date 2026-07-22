import fs from 'fs'
const R = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const N = [-416.39,-164.22]
const d=(p)=>Math.hypot(p[0]-N[0],p[1]-N[1])
// identity = bare street name (the SVn family key)
const idOf = s => (s.name||s.skelId||'').trim()
console.log(`node [${N}]  — everything within 10m, by identity:\n`)
const rows=[]
for(const s of R.streets){
  const p=s.points; if(!p||p.length<2) continue
  for(let i=0;i<p.length;i++){
    if(d(p[i])>10) continue
    const isEnd=(i===0||i===p.length-1)
    rows.push({id:idOf(s), skelId:s.skelId, kind:isEnd?'END':'INTERIOR', dist:+d(p[i]).toFixed(2)})
  }
}
// collapse duplicate (skelId,kind) 
const seen=new Set(), uniq=[]
for(const r of rows){const k=r.skelId+r.kind; if(seen.has(k))continue; seen.add(k); uniq.push(r)}
uniq.sort((a,b)=>a.dist-b.dist)
for(const r of uniq) console.log(`  ${r.kind.padEnd(9)} ${r.id.padEnd(22)} (${r.skelId})  @${r.dist}m`)

// terminal verdict by IDENTITY
const byId={}
for(const r of uniq){ (byId[r.id]=byId[r.id]||[]).push(r.kind) }
console.log('\n  identities present:', Object.keys(byId))
const ids=Object.keys(byId)
if(ids.length===1){
  console.log(`  → ALL ONE IDENTITY (${ids[0]}). Every ending here is SV-into-SV = INTERNAL. No corner. (roundabout self-join)`)
}else{
  for(const id of ids){
    const ends=byId[id].filter(k=>k==='END').length, ins=byId[id].filter(k=>k==='INTERIOR').length
    const role = ins>0 ? 'THROUGH (passes)' : (ends>0? 'TERMINAL/stem (ends into another identity)' : '?')
    console.log(`   ${id}: ${byId[id].join(',')}  → ${role}`)
  }
}
