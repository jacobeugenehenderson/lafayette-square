import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdirSync, statSync } from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir='public/baked/lafayette-square/trees';
function sig(d){
  const prims=[];
  for(const m of d.getRoot().listMeshes())for(const pr of m.listPrimitives()){
    const attrs=pr.listSemantics().sort().join('+');
    const k=(pr.getExtras()||{}).atlasKind||'?';
    const nt=(pr.getIndices()?.getCount()||0)/3;
    prims.push(`${k}:${attrs}:${nt}t`);
  }
  return prims.sort();
}
const species=readdirSync(dir).filter(s=>{try{return statSync(`${dir}/${s}`).isDirectory()}catch{return false}});
for(const sp of species){
  let files;try{files=readdirSync(`${dir}/${sp}`);}catch{continue;}
  const variants=[...new Set(files.filter(f=>/skeleton-\d+-lod\d/.test(f)).map(f=>f.match(/skeleton-(\d+)-/)[1]))];
  for(const vid of variants){
    const sigs={};
    for(const lod of ['lod1','lod2']){
      const p=`${dir}/${sp}/skeleton-${vid}-${lod}.glb`;
      try{sigs[lod]=sig(await io.read(p));}catch{sigs[lod]=['MISSING'];}
    }
    // compare prim KINDS+ATTRS (ignore tri counts)
    const kinds=s=>s.map(x=>x.split(':').slice(0,2).join(':')).sort().join(' | ');
    if(kinds(sigs.lod1)!==kinds(sigs.lod2)){
      console.log(`⚠ ${sp} v${vid}: lod1 prims != lod2 prims`);
      console.log(`   lod1: ${kinds(sigs.lod1)}`);
      console.log(`   lod2: ${kinds(sigs.lod2)}`);
    }
  }
}
console.log('done (only mismatches shown)');
