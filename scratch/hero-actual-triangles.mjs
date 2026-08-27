// What the runtime ACTUALLY draws as mesh, and its triangle cost — including the
// placements the band left as impostors that fall through to mesh for want of a
// baked impostor asset. ▶ node scratch/hero-actual-triangles.mjs [--band]
import fs from 'fs'
const SLAB='public/baked/lafayette-square'
const t=JSON.parse(fs.readFileSync(`${SLAB}/trees.json`,'utf8'))
const a=JSON.parse(fs.readFileSync(`${SLAB}/trees-atlas.json`,'utf8'))
const hero=new Set(Object.keys(a.heroImpostorBySpecies||{}))
const band=!process.argv.includes('--legacy')
function trisOfGlb(p){
  if(!fs.existsSync(p)) return null
  const b=fs.readFileSync(p); if(b.readUInt32LE(0)!==0x46546C67) return null
  const json=JSON.parse(b.slice(20,20+b.readUInt32LE(12)).toString('utf8'))
  let n=0; for(const m of json.meshes||[]) for(const pr of m.primitives||[])
    if(pr.indices!=null) n+=Math.floor(json.accessors[pr.indices].count/3)
  return n
}
const cache=new Map()
const trisFor=i=>{const u=i.lods?.lod1; if(!u) return null
  if(!cache.has(u)) cache.set(u,trisOfGlb(SLAB+u)); return cache.get(u)}
const dbhs=t.instances.map(i=>Number(i.dbh)||0).sort((x,y)=>x-y)
const cut=dbhs[Math.floor(0.85*(dbhs.length-1))]
let tris=0, meshEarned=0, meshLeaked=0, imp=0, missingGlb=0
for(const i of t.instances){
  const wantsImp = band ? i.heroRole==='impostor' : (Number(i.dbh)||0)<cut
  if(hero.has(i.species)&&wantsImp){imp++;continue}
  const n=trisFor(i)
  if(n==null) missingGlb++; else tris+=n
  if(hero.has(i.species)) meshEarned++; else meshLeaked++
}
console.log(band?'?heroBand=1 (the new bake)':'DEFAULT legacy dbh cut')
console.log(`  impostor      ${imp}`)
console.log(`  mesh earned   ${meshEarned}`)
console.log(`  mesh leaked   ${meshLeaked}  (no baked impostor for the species)`)
console.log(`  TRIANGLES     ${(tris/1e6).toFixed(1)}M   (${missingGlb} mesh placements have NO readable lod1 on disk)`)
