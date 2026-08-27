// Simulate InstancedTrees' role resolution EXACTLY (roster substitution included)
// so the mesh/impostor split is the one that actually renders.
// ▶ node scratch/hero-runtime-sim.mjs [--legacy]
import fs from 'fs'
const SLAB='public/baked/lafayette-square'
const t=JSON.parse(fs.readFileSync(`${SLAB}/trees.json`,'utf8'))
const a=JSON.parse(fs.readFileSync(`${SLAB}/trees-atlas.json`,'utf8'))
const d=JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json','utf8'))
const hero=new Set(Object.keys(a.heroImpostorBySpecies||{}))
const legacy=process.argv.includes('--legacy')

const rosterArr=(d.trees||[]).map(x=>({species:x.species,variantId:x.variantId,category:x.category}))
const roster=new Set(rosterArr.map(x=>`${x.species}:${x.variantId}`))
// category per roster entry — fall back to the bake's own instances if design omits it
const catBySp=new Map()
for(const i of t.instances) if(!catBySp.has(i.species)) catBySp.set(i.species,i.category||'broadleaf')
const byCategory=new Map(), flatPool=[]
for(const r of rosterArr){ const c=r.category||catBySp.get(r.species)||'broadleaf'
  if(!byCategory.has(c)) byCategory.set(c,[]); byCategory.get(c).push(r); flatPool.push(r) }

const fallbackFor=(inst,idx)=>{
  const cat=inst.category||'broadleaf'
  const pool=byCategory.get(cat)||flatPool
  const seed=Math.imul(((inst.x*1000)|0)^idx*73856093, ((inst.z*1000)|0)^19349663)
  let h=(seed|0)>>>0; h=Math.imul(h^(h>>>16),2246822507); h^=h>>>13
  return pool[(h>>>0)%pool.length]
}
const dbhs=t.instances.map(i=>Number(i.dbh)||0).sort((x,y)=>x-y)
const cut=dbhs[Math.floor(0.85*(dbhs.length-1))]

let imp=0,earned=0,leaked=0,dropped=0
const bins=[[0,50],[50,100],[100,181],[181,250],[250,591],[591,1e9]].map(b=>({b,imp:0,mesh:0}))
t.instances.forEach((inst,idx)=>{
  const inR=roster.has(`${inst.species}:${inst.variantId}`)
  let sub=null
  if(!inR){ sub=fallbackFor(inst,idx); if(!sub){dropped++;return} }
  const rs=inR?inst.species:sub.species
  const wantsImp = legacy ? ((Number(inst.dbh)||0)<cut) : inst.heroRole==='impostor'
  const isImp = !!(hero.has(rs)&&wantsImp)
  if(isImp) imp++; else if(hero.has(rs)) earned++; else leaked++
  const bin=bins.find(x=>inst.panDist>=x.b[0]&&inst.panDist<x.b[1])
  if(bin){ isImp?bin.imp++:bin.mesh++ }
})
console.log(legacy?'DEFAULT (legacy dbh cut)':'?heroBand=1 — the new 86M bake')
console.log(`  impostor ${imp} | mesh ${earned+leaked} (${earned} earned + ${leaked} no-impostor-asset) | dropped ${dropped}`)
console.log('  panDist'.padEnd(14),'impostor'.padStart(9),'mesh'.padStart(7),'imp%'.padStart(6))
for(const x of bins) console.log('  '+(x.b[0]+'-'+(x.b[1]>1e8?'∞':x.b[1])+'m').padEnd(12),
  String(x.imp).padStart(9),String(x.mesh).padStart(7),(100*x.imp/((x.imp+x.mesh)||1)).toFixed(0).padStart(5)+'%')
