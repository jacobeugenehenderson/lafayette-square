import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
function smear(uv, idx){let s15=0,worst=0;for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
  const dU=Math.max(uv[a*2],uv[b*2],uv[c*2])-Math.min(uv[a*2],uv[b*2],uv[c*2]);
  const dV=Math.max(uv[a*2+1],uv[b*2+1],uv[c*2+1])-Math.min(uv[a*2+1],uv[b*2+1],uv[c*2+1]);
  const m=Math.max(dU,dV); if(m>1.5)s15++; worst=Math.max(worst,m);}return {tris:idx.length/3,s15,worst:+worst.toFixed(2)};}
const base=await io.read('/tmp/salon-ash_green.glb'); smoothWeldBark(base);
const bp=getBark(base);
const pos=new Float32Array(bp.getAttribute('POSITION').getArray());
const uv=new Float32Array(bp.getAttribute('TEXCOORD_0').getArray());
const isrc=bp.getIndices().getArray(); const indices=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
console.log('BASELINE welded, no simplify:', smear(uv,indices));
for(const w of [0.5, 20, 100, 1000]){
  const target=Math.max(3,Math.floor(indices.length*0.15/3)*3);
  const res=MeshoptSimplifier.simplifyWithAttributes(indices.slice(),pos,3,uv,2,[w,w],null,target,0.05,[]);
  console.log(`uvW=${w} ratio0.15:`, smear(uv,res[0]));
}
