import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const R = JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/ribbons.json'),'utf8'))
const byId=new Map((R.streets||[]).map(s=>[s.skelId||s.name,s]))
const key=p=>p[0].toFixed(2)+','+p[1].toFixed(2)
const have=new Set(); for(const s of (R.streets||[])) for(const p of (s.points||[])) have.add(key(p))
const nodes=R.junctionMap?.nodes||[]
const miss=nodes.filter(n=>!have.has(key(n.at)))
for(const n of miss.slice(0,6)){
  const chains=(n.legs||[]).map(l=>l.chain)
  // nearest vertex on EACH named chain to nd.at
  const info=chains.map(c=>{const s=byId.get(c); if(!s) return `${c}: NO SUCH CHAIN`
    let b=Infinity; for(const p of s.points){const d=Math.hypot(p[0]-n.at[0],p[1]-n.at[1]); if(d<b)b=d}
    return `${c}: nearest own vertex ${b.toFixed(1)} m`})
  console.log(`at=[${n.at.map(v=>v.toFixed(1))}] kinds=${(n.kinds||[]).join('+')||'-'}\n    ${info.join('\n    ')}`)
}
// do the named chains actually share a vertex anywhere?
let share=0,noshare=0
for(const n of miss){ const cs=(n.legs||[]).map(l=>byId.get(l.chain)).filter(Boolean)
  if(cs.length<2){noshare++;continue}
  const A=new Set(cs[0].points.map(key)); if(cs[1].points.some(p=>A.has(key(p)))) share++; else noshare++ }
console.log(`\nof the ${miss.length} unlocatable nodes: ${share} whose two named chains DO share a vertex somewhere else, ${noshare} that do not (or are 1-leg)`)
