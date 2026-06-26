import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function bark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){const ex=p.getExtras()||{};if(ex.atlasKind==='bark')return p;}}
function stat(doc){const p=bark(doc);return {v:p.getAttribute('POSITION').getCount(), t:(p.getIndices()?.getCount()||0)/3};}
async function load(){const d=await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
  // strip leaf prims
  for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){const ex=p.getExtras()||{};if(ex.atlasKind!=='bark')p.dispose();}
  return d;}

// recompute smooth normals: vertex normal = area-weighted avg of incident face normals, grouped by POSITION (so seams merge)
function smoothNormals(prim){
  const pos=prim.getAttribute('POSITION').getArray();
  const idx=prim.getIndices().getArray();
  const nv=pos.length/3;
  const acc=new Float32Array(nv*3);
  // map position-key -> list of vert indices (to share normals across uv-split verts)
  const key=i=>`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
  const groups=new Map();
  for(let i=0;i<nv;i++){const k=key(i); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(i);}
  const gacc=new Map();
  for(let t=0;t<idx.length/3;t++){
    const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2],bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2],cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx; // area-weighted (not normalized)
    for(const vi of [a,b,c]){const k=key(vi); const g=gacc.get(k)||[0,0,0]; g[0]+=fx;g[1]+=fy;g[2]+=fz; gacc.set(k,g);}
  }
  const out=new Float32Array(nv*3);
  for(let i=0;i<nv;i++){const g=gacc.get(key(i)); let x=g[0],y=g[1],z=g[2]; const L=Math.hypot(x,y,z)||1; out[i*3]=x/L;out[i*3+1]=y/L;out[i*3+2]=z/L;}
  prim.getAttribute('NORMAL').setArray(out);
}

// A: just weld with smooth normals, NO uv preservation distinction
let d=await load(); smoothNormals(bark(d));
await d.transform(weld(), dedup());
console.log('smooth-normal + weld:', stat(d));
await d.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.25, error:0.01}));
console.log('  + simplify r=0.25:', stat(d));
await d.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.05, error:0.05}));
console.log('  + simplify r=0.05 (cumulative):', stat(d));

// B: how low can it go (lod2-ish)
let d2=await load(); smoothNormals(bark(d2));
await d2.transform(weld(), dedup(), simplify({simplifier:MeshoptSimplifier, ratio:0.02, error:0.1}));
console.log('smooth+weld+simplify r=0.02 err=0.1:', stat(d2));
