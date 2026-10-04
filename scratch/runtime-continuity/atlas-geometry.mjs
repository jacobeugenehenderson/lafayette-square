import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { treeGeometryOfTown } from '../../scripts/slab-tree-geometry.mjs'
const R='public/baked'
for (const l of readdirSync(R)) {
  const d=`${R}/${l}`; const rj=p=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null
  const t=rj(`${d}/trees.json`), a=rj(`${d}/trees-atlas.json`), s=rj(`${d}/scene.json`)
  const inst=t?.instances||[]
  const mt={}; for(const i of inst){const k=String(i.meshTier);mt[k]=(mt[k]||0)+1}
  let g; try{g=treeGeometryOfTown(d,l)}catch(e){g={err:e.message}}
  console.log(l, JSON.stringify({meshTierStamped:t?.meshTierStamped, meshTier:mt, hero:a?.heroImpostorBySpecies?Object.keys(a.heroImpostorBySpecies).length:null, impostorBySpecies:a?.impostorBySpecies?Object.keys(a.impostorBySpecies).length:null, overhead:a?.overheadBySpecies?Object.keys(a.overheadBySpecies).length:null, sceneHero:s?.heroImpostor, atlasKeys:a?Object.keys(a):null, geom:g}))
}
