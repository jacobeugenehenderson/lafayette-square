import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
function smear(uv, idx){ // count tris spanning >1.5 UV units (definite seam-cross smear) and >3
  let s15=0,s3=0,worst=0;
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const dU=Math.max(uv[a*2],uv[b*2],uv[c*2])-Math.min(uv[a*2],uv[b*2],uv[c*2]);
    const dV=Math.max(uv[a*2+1],uv[b*2+1],uv[c*2+1])-Math.min(uv[a*2+1],uv[b*2+1],uv[c*2+1]);
    const m=Math.max(dU,dV); if(m>1.5)s15++; if(m>3)s3++; worst=Math.max(worst,m);}
  return {tris:idx.length/3, s15, s3, worst:+worst.toFixed(2)};
}
async function trial(label, uvWeight, flags, ratio){
  const doc=await io.read('/tmp/salon-ash_green.glb'); smoothWeldBark(doc);
  const prim=getBark(doc);
  const pos=new Float32Array(prim.getAttribute('POSITION').getArray());
  const uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());
  const isrc=prim.getIndices().getArray();
  const indices=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
  const target=Math.max(3,Math.floor(indices.length*ratio/3)*3);
  const res=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,uv,2,[uvWeight,uvWeight],null,target,0.05,flags);
  const sm=smear(uv,res[0]);
  console.log(`${label}: tris=${sm.tris} smear>1.5=${sm.s15} smear>3=${sm.s3} worst=${sm.worst}`);
}
console.log('-- ratio 0.15 (Lever5 default, ~lod0 bark) --');
await trial('plain      ',0.5,[],0.15);
await trial('LockBorder ',0.5,['LockBorder'],0.15);
await trial('LockBorder uvW2',2.0,['LockBorder'],0.15);
console.log('-- ratio 0.02 (aggressive, lod2 bark) --');
await trial('plain      ',0.5,[],0.02);
await trial('LockBorder ',0.5,['LockBorder'],0.02);
