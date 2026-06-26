import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
let leaf;
for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){if((p.getExtras()||{}).atlasKind==='leaf')leaf=p;}
const pos=leaf.getAttribute('POSITION').getArray();
const nv=leaf.getAttribute('POSITION').getCount();
const idx=leaf.getIndices().getArray();
const sp=new Set();for(let i=0;i<nv;i++)sp.add(`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`);
console.log(`leaf prim: verts=${nv} tris=${idx.length/3} uniqPos=${sp.size} (${(nv/sp.size).toFixed(2)}x split)`);
// vert-use pattern: max times any vertex index is referenced (cards=1, connected>1)
const use=new Map();for(const v of idx)use.set(v,(use.get(v)||0)+1);
let maxUse=0,share=0;for(const u of use.values()){maxUse=Math.max(maxUse,u);}
console.log(`max vert-use=${maxUse} (1=separate cards, >1=connected mesh)`);
// can emitLod-style simplify reduce it? isolate leaf, weld+simplify various error
for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){if((p.getExtras()||{}).atlasKind!=='leaf')p.dispose();}
function tris(d){let t=0;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())t+=(p.getIndices()?.getCount()||0)/3;return t;}
for(const [r,e] of [[0.1,0.008],[0.1,0.02],[0.1,0.05],[0.02,0.05]]){
  const d2=await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
  for(const m of d2.getRoot().listMeshes())for(const p of m.listPrimitives()){if((p.getExtras()||{}).atlasKind!=='leaf')p.dispose();}
  await d2.transform(weld(),dedup(),simplify({simplifier:MeshoptSimplifier,ratio:r,error:e}));
  console.log(`leaf weld+simplify r=${r} err=${e}: ${tris(d2)} tris`);
}
