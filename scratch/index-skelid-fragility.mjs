import { readFileSync } from 'fs'
const SK=JSON.parse(readFileSync('cartograph/data/ls-dryrun-ferrule/clean/skeleton.json','utf8'))
const D =JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))
const O =JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/overlay.json','utf8'))

// group chains by street name — the exact partition skeleton.js:1681 indexes into
const byName=new Map()
for(const s of SK.streets){ if(!byName.has(s.name)) byName.set(s.name,[]); byName.get(s.name).push(s) }

const authored=new Set()
for(const k of Object.keys(D.blockCustoms||{})) authored.add(k)
const overlayChains=new Set(Object.keys(O.streets||{}))

console.log('=== skelId FORM: how many chains does each street have? ===')
let single=0, multi=0
for(const [n,cs] of byName){ if(cs.length===1) single++; else multi++ }
console.log(`  streets emitting ONE chain  (id = slug, NO suffix): ${single}`)
console.log(`  streets emitting MANY chains (id = slug-i, INDEXED): ${multi}`)
console.log(`  → ${SK.streets.length} chains total; every id in the multi group is a POSITIONAL INDEX\n`)

console.log('=== THE 9 AUTHORED CHAINS — fragility under a reconnect ===')
console.log('chain                    | street chain count | id form   | what a reconnect does')
const slotCount={}
for(const skel of Object.keys(D.blockCustoms||{})){
  let n=0; for(const side of Object.keys(D.blockCustoms[skel])) n+=Object.keys(D.blockCustoms[skel][side]).length
  slotCount[skel]=n
}
for(const skel of [...authored].sort()){
  const ch=SK.streets.find(s=>s.id===skel)
  if(!ch){console.log(`  ${skel.padEnd(24)} | ⛔ NOT IN SKELETON`);continue}
  const sibs=byName.get(ch.name)||[]
  const indexed=sibs.length>1
  const risk = indexed
    ? `⛔ merging ANY earlier fragment renumbers this id (it is index ${sibs.findIndex(s=>s.id===skel)} of ${sibs.length})`
    : `⛔ id has NO suffix — if this street ever SPLITS, id becomes "${skel}-0" and every slot dies`
  console.log(`  ${skel.padEnd(24)} | ${String(sibs.length).padStart(2)} chain(s)        | ${(indexed?'slug-i':'slug').padEnd(9)} | ${risk}`)
  console.log(`  ${''.padEnd(24)} |    ${slotCount[skel]} authored slot(s)`)
}

// Blast radius: if EVERY street's fragments fully reconnected into one chain each
console.log('\n=== SIMULATION: full reconnect (every street welds to a single chain) ===')
let dead=0, survives=0
for(const skel of authored){
  const ch=SK.streets.find(s=>s.id===skel); if(!ch) continue
  const sibs=byName.get(ch.name)||[]
  const newId = slugifyName(ch.name)   // chains.length===1 → no suffix
  if(newId===skel) survives+=slotCount[skel]; else { dead+=slotCount[skel]
    console.log(`  ${skel} → "${newId}"   ⛔ ${slotCount[skel]} slot(s) orphan`) }
}
function slugifyName(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
console.log(`\n  authored slots that SURVIVE a full reconnect: ${survives}`)
console.log(`  authored slots ORPHANED by the id change alone: ${dead}   (before segOrd is even considered)`)
console.log(`\n=== overlay.json (${overlayChains.size} skelId-keyed streets) under the same event ===`)
let oDead=0
for(const id of overlayChains){ const ch=SK.streets.find(s=>s.id===id); if(!ch){oDead++;continue}
  const sibs=byName.get(ch.name)||[]; if(sibs.length>1) oDead++ }
console.log(`  overlay entries whose skelId is a positional index (or already absent): ${oDead} of ${overlayChains.size}`)
