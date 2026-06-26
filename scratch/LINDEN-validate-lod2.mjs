import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readdirSync, statSync } from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir='public/baked/lafayette-square/trees';
const species=readdirSync(dir).filter(s=>{try{return statSync(`${dir}/${s}`).isDirectory()}catch{return false}});
let problems=0;
for(const sp of species){
  let files;try{files=readdirSync(`${dir}/${sp}`).filter(f=>f.endsWith('lod2.glb'));}catch{continue;}
  for(const f of files){
    const p=`${dir}/${sp}/${f}`;
    try{
      const d=await io.read(p);
      for(const m of d.getRoot().listMeshes())for(const pr of m.listPrimitives()){
        const pos=pr.getAttribute('POSITION');const idx=pr.getIndices();
        const k=(pr.getExtras()||{}).atlasKind||'?';
        const nv=pos?pos.getCount():0;const nt=idx?idx.getCount()/3:0;
        let bad=[];
        if(nv===0)bad.push('EMPTY-pos');
        if(idx && idx.getCount()===0)bad.push('EMPTY-idx');
        // NaN/Inf check + bbox
        if(pos){const a=pos.getArray();let nan=0,mx=0;for(let i=0;i<a.length;i++){if(!isFinite(a[i]))nan++;mx=Math.max(mx,Math.abs(a[i]));}if(nan)bad.push(`NaN(${nan})`);if(mx>1e5)bad.push(`HUGE(${mx.toExponential(1)})`);}
        // index out of range
        if(idx&&pos){const ia=idx.getArray();let oob=0;for(let i=0;i<ia.length;i++)if(ia[i]>=nv)oob++;if(oob)bad.push(`OOB(${oob})`);}
        if(bad.length){console.log(`⚠ ${sp}/${f} [${k}] nv=${nv} nt=${nt}: ${bad.join(',')}`);problems++;}
      }
    }catch(e){console.log(`✗ ${sp}/${f}: READ FAIL ${e.message}`);problems++;}
  }
}
console.log(problems?`\n${problems} problem prim(s)`:'\nAll lod2 prims valid (no empty/NaN/OOB/huge).');
