import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
const base=await io.read('/tmp/salon-ash_green.glb'); smoothWeldBark(base);
const bp=getBark(base);
const pos=new Float32Array(bp.getAttribute('POSITION').getArray());
const uv=new Float32Array(bp.getAttribute('TEXCOORD_0').getArray());
const isrc=bp.getIndices().getArray(); const indices=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
const nv=pos.length/3;
// group UVs by position; a position is a MAJOR seam if its UVs spread > THRESH
function buildLock(thresh){
  const byPos=new Map();
  for(let i=0;i<nv;i++){const k=`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
    let a=byPos.get(k); if(!a){a=[];byPos.set(k,a);} a.push(i);}
  const lock=new Uint8Array(nv); let lp=0;
  for(const arr of byPos.values()){
    if(arr.length<2) continue;
    let spread=0;
    for(let x=0;x<arr.length;x++)for(let y=x+1;y<arr.length;y++){
      const i=arr[x],j=arr[y];
      spread=Math.max(spread, Math.abs(uv[i*2]-uv[j*2]), Math.abs(uv[i*2+1]-uv[j*2+1]));
    }
    if(spread>thresh){ for(const i of arr){lock[i]=1;} lp++; }
  }
  return {lock, positions:lp, verts:lock.reduce((a,b)=>a+b,0)};
}
function smearWorst(idx){let w=0;for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
  const dU=Math.max(uv[a*2],uv[b*2],uv[c*2])-Math.min(uv[a*2],uv[b*2],uv[c*2]);
  const dV=Math.max(uv[a*2+1],uv[b*2+1],uv[c*2+1])-Math.min(uv[a*2+1],uv[b*2+1],uv[c*2+1]);
  w=Math.max(w,dU,dV);}return +w.toFixed(2);}
for(const thresh of [0.5,1.0]){
  const {lock,positions,verts}=buildLock(thresh);
  console.log(`\n-- major-seam thresh=${thresh}: ${positions} seam positions, ${verts} locked verts (${(verts/nv*100).toFixed(1)}%) --`);
  for(const ratio of [0.15,0.02]){
    const target=Math.max(3,Math.floor(indices.length*ratio/3)*3);
    const res=MeshoptSimplifier.simplifyWithAttributes(indices.slice(),pos,3,uv,2,[0.5,0.5],lock,target,0.05,[]);
    console.log(`   ratio${ratio}: tris=${res[0].length/3} worstSpan=${smearWorst(res[0])}`);
  }
}
