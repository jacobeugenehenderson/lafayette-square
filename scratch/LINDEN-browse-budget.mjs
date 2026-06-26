import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const slab=JSON.parse(readFileSync('public/baked/lafayette-square.json','utf8'));
const insts=slab.instances||slab.trees||[];
console.log('total placements:', insts.length, '| keys:', Object.keys(insts[0]||{}).join(','));
// tri count per variant lod2
const triCache=new Map();
async function lod2tris(url){
  if(!url)return 0;
  if(triCache.has(url))return triCache.get(url);
  const p='public/baked/lafayette-square'+url; // url like /trees/.../skeleton-x-lod2.glb
  let t=0;try{const d=await io.read(p);for(const m of d.getRoot().listMeshes())for(const pr of m.listPrimitives())t+=(pr.getIndices()?.getCount()||0)/3;}catch(e){t=-1;}
  triCache.set(url,t);return t;
}
let total=0;const perSpecies=new Map();
for(const inst of insts){
  const lod2url=(inst.lods&&inst.lods.lod2)||inst.url;
  const t=await lod2tris(lod2url);
  if(t>0){total+=t;const sp=inst.species||'?';perSpecies.set(sp,(perSpecies.get(sp)||0)+t);}
}
console.log(`\nTOTAL Browse rendered tris (all placements @ lod2): ${(total/1e6).toFixed(2)}M`);
console.log('\nTop species by total rendered tris:');
[...perSpecies.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([s,t])=>console.log(`  ${s}: ${(t/1e6).toFixed(2)}M`));
