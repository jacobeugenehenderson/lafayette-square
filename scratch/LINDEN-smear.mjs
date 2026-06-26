import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
// smear metric: count tris whose UV span (max of dU,dV across its 3 corners) > 0.5 (crosses ~half a tile)
function smear(pos, uv, idx){
  let n=0, worst=0;
  for(let t=0;t<idx.length/3;t++){
    const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const us=[uv[a*2],uv[b*2],uv[c*2]], vs=[uv[a*2+1],uv[b*2+1],uv[c*2+1]];
    const dU=Math.max(...us)-Math.min(...us), dV=Math.max(...vs)-Math.min(...vs);
    const s=Math.max(dU,dV); if(s>0.5)n++; worst=Math.max(worst,s);
  }
  return {smearTris:n, worst:worst.toFixed(2), tris:idx.length/3};
}
// seam verts = positions carrying >1 distinct UV (kept separate by pos+uv weld)
function seamLockArray(pos, uv, nv){
  const byPos=new Map();
  for(let i=0;i<nv;i++){const k=`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
    let s=byPos.get(k); if(!s){s=new Set();byPos.set(k,s);} s.add(`${Math.round(uv[i*2]*1e3)},${Math.round(uv[i*2+1]*1e3)}`);}
  const lock=new Uint8Array(nv);
  let locked=0;
  for(let i=0;i<nv;i++){const k=`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
    if(byPos.get(k).size>1){lock[i]=1;locked++;}}
  return {lock, locked};
}

async function trial(uvWeight, useLock, targetRatio){
  const doc=await io.read('/tmp/salon-ash_green.glb');
  smoothWeldBark(doc);
  const prim=getBark(doc);
  const pos=new Float32Array(prim.getAttribute('POSITION').getArray());
  const uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());
  const idxSrc=prim.getIndices().getArray();
  const indices=idxSrc instanceof Uint32Array?idxSrc.slice():new Uint32Array(idxSrc);
  const nv=pos.length/3;
  const {lock,locked}=seamLockArray(pos,uv,nv);
  const target=Math.max(3,Math.floor(indices.length*targetRatio/3)*3);
  const res=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,uv,2,[uvWeight,uvWeight],useLock?lock:null,target,0.05,[]);
  const newIdx=res[0];
  const sm=smear(pos,uv,newIdx);
  console.log(`uvW=${uvWeight} lock=${useLock?('Y('+locked+'v)'):'N'}: tris=${sm.tris} smearTris=${sm.smearTris} worstUVspan=${sm.worst}`);
}
console.log('target ratio 0.15 (Lever5 default):');
await trial(0.5,false,0.15);   // current behavior
await trial(2.0,false,0.15);
await trial(8.0,false,0.15);
await trial(0.5,true,0.15);    // seam lock
await trial(2.0,true,0.15);
