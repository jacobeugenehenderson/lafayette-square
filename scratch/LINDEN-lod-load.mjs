import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const slab=JSON.parse(readFileSync('public/baked/lafayette-square.json','utf8'));
const insts=slab.instances||[];
const triCache=new Map();
async function tris(url){if(!url)return 0;if(triCache.has(url))return triCache.get(url);let t=0;try{const d=await io.read('public/baked/lafayette-square'+url);for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())t+=(p.getIndices()?.getCount()||0)/3;}catch{t=0;}triCache.set(url,t);return t;}
for(const lod of ['lod0','lod1','lod2']){
  let total=0;const perSp=new Map();
  for(const inst of insts){const u=(inst.lods&&inst.lods[lod])||inst.url;const t=await tris(u);total+=t;const s=inst.species;perSp.set(s,(perSp.get(s)||0)+t);}
  console.log(`\n=== ${lod}: ALL ${insts.length} trees = ${(total/1e6).toFixed(2)}M tris ===`);
  if(lod==='lod0'){console.log('top species (lod0):');[...perSp.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([s,t])=>console.log(`  ${s}: ${(t/1e6).toFixed(2)}M`));}
}
// per-tree lod0 for key species
console.log('\n=== per-tree lod0 tris ===');
const seen=new Set();
for(const inst of insts){const k=inst.species;if(seen.has(k))continue;seen.add(k);const t=await tris((inst.lods&&inst.lods.lod0)||inst.url);if(t>20000)console.log(`  ${k}: ${(t/1000).toFixed(0)}K`);}
