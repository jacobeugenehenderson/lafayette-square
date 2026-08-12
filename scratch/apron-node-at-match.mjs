import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const R = JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/ribbons.json'),'utf8'))
const all = (R.streets||[]).filter(s=>s?.points?.length>=2)
const nodes = R.junctionMap?.nodes||[]
const key=p=>p[0].toFixed(2)+','+p[1].toFixed(2)
const have=new Set(); for(const s of all) for(const p of s.points) have.add(key(p))
const miss = nodes.filter(n=>!have.has(key(n.at)))
console.log('nodes whose `at` matches NO vertex of ANY ribbons.street (incl. gradeSeparated):', miss.length, 'of', nodes.length)
// nearest distance for the misses
let d=[]; for(const n of miss){ let b=Infinity; for(const s of all) for(const p of s.points){const q=Math.hypot(p[0]-n.at[0],p[1]-n.at[1]); if(q<b)b=q} d.push(b) }
d.sort((a,b)=>a-b); console.log('  nearest-vertex distance: min',d[0]?.toFixed(3),'median',d[d.length>>1]?.toFixed(3),'max',d[d.length-1]?.toFixed(3),'m')
console.log('  their legs:',miss.slice(0,5).map(n=>JSON.stringify(n.legs)).join('\n    '))
const gs = new Set(all.filter(s=>s.gradeSeparated).map(s=>s.skelId||s.name))
console.log('  how many of these nodes reference a gradeSeparated chain:', miss.filter(n=>(n.legs||[]).some(l=>gs.has(l.chain))).length)
