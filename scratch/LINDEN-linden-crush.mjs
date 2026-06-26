import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(d){for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
const doc=await io.read('/tmp/salon-linden_american.glb'); smoothWeldBark(doc);
const prim=getBark(doc);
const pos=new Float32Array(prim.getAttribute('POSITION').getArray());
const uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());
const idx=prim.getIndices().getArray();const indices=idx instanceof Uint32Array?idx.slice():new Uint32Array(idx);
const nv=pos.length/3;
console.log('linden bark after smooth-weld:', nv,'verts', indices.length/3,'tris');
// attribute-preserving (current path) at ratio 0.013 (lod2-ish)
{const tgt=Math.max(3,Math.floor(indices.length*0.013/3)*3);const r=MeshoptSimplifier.simplifyWithAttributes(indices.slice(),pos,3,uv,2,[1,1],null,tgt,0.05,[]);console.log('  attr-preserving r=.013:', r[0].length/3,'tris (FLOORS)');}
// AGGRESSIVE: position-weld then plain simplify
{
  const key=i=>`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
  const map=new Map();const remap=new Uint32Array(nv);const np=[];
  for(let i=0;i<nv;i++){const k=key(i);let ni=map.get(k);if(ni===undefined){ni=np.length/3;map.set(k,ni);np.push(pos[i*3],pos[i*3+1],pos[i*3+2]);}remap[i]=ni;}
  const ppos=new Float32Array(np);const nidx=new Uint32Array(indices.length);for(let i=0;i<indices.length;i++)nidx[i]=remap[indices[i]];
  console.log('  position-weld:', ppos.length/3,'verts');
  for(const ratio of [0.05,0.013]){const tgt=Math.max(3,Math.floor(nidx.length*ratio/3)*3);const r=MeshoptSimplifier.simplify(nidx.slice(),ppos,3,tgt,0.1,[]);console.log(`  pos-weld+plain simplify r=${ratio}:`, r[0].length/3,'tris');}
}
