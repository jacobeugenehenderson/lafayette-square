// The walk painter's own decline ledger, on ANY shape artifact. Read-only.
import fs from 'fs'
import { sectionPassTile, cornerDump } from '../src/lib/tileGround.js'
const p = process.argv[2], cw = Number(process.argv[3] ?? 0.381)
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json','utf8'))
const T = (JSON.parse(fs.readFileSync(p,'utf8')).tiles)||[]
cornerDump.on = true
const reasons={}; let threw=0
for (const st of T){ cornerDump.rows.length=0
  try{ sectionPassTile(st, cw, {outer:'LU',inner:'SW'}, design.blockCustoms||null) }catch(e){ threw++; continue }
  for(const r of cornerDump.rows) reasons[r.reason]=(reasons[r.reason]||0)+1 }
const tot=Object.values(reasons).reduce((a,b)=>a+b,0), built=reasons.BUILT||0
console.log(`${p}\n  tiles ${T.length} · throws ${threw} · corners BID ${tot} · BUILT ${built} (${(100*built/tot).toFixed(1)}%)`)
for(const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`)
