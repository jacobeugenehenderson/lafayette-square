import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdirSync, statSync } from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir='public/baked/lafayette-square/trees';
const species=readdirSync(dir).filter(s=>{try{return statSync(`${dir}/${s}`).isDirectory()}catch{return false}});
let problems=0;
for(const sp of species){
  let files;try{files=readdirSync(`${dir}/${sp}`).filter(f=>/lod[12]\.glb$/.test(f));}catch{continue;}
  for(const f of files){
    try{
      const d=await io.read(`${dir}/${sp}/${f}`);
      for(const m of d.getRoot().listMeshes())for(const pr of m.listPrimitives()){
        const pos=pr.getAttribute('POSITION');if(!pos)continue;
        const nv=pos.getCount();const k=(pr.getExtras()||{}).atlasKind||'?';
        // every attribute must match POSITION count
        for(const sem of pr.listSemantics()){
          const c=pr.getAttribute(sem).getCount();
          if(c!==nv){console.log(`⚠ ${sp}/${f} [${k}] ${sem} count=${c} != POSITION ${nv}`);problems++;}
        }
        // indices in range
        const idx=pr.getIndices();
        if(idx){const ia=idx.getArray();let oob=0;for(let i=0;i<ia.length;i++)if(ia[i]>=nv)oob++;if(oob){console.log(`⚠ ${sp}/${f} [${k}] ${oob} OOB indices (nv=${nv})`);problems++;}}
      }
    }catch(e){console.log(`✗ ${sp}/${f}: ${e.message}`);problems++;}
  }
}
console.log(problems?`\n${problems} PROBLEM(S)`:'\nAll lod1/lod2 prims: attribute counts consistent, indices valid.');
