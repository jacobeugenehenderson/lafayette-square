import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function smoothNormals(prim){
  const pos=prim.getAttribute('POSITION').getArray();
  const idx=prim.getIndices().getArray();
  const nv=pos.length/3;
  const key=i=>`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;
  const gacc=new Map();
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2];
    const ux=pos[b*3]-ax,uy=pos[b*3+1]-ay,uz=pos[b*3+2]-az,vx=pos[c*3]-ax,vy=pos[c*3+1]-ay,vz=pos[c*3+2]-az;
    const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;
    for(const vi of [a,b,c]){const k=key(vi);const g=gacc.get(k)||[0,0,0];g[0]+=fx;g[1]+=fy;g[2]+=fz;gacc.set(k,g);}}
  const out=new Float32Array(nv*3);
  for(let i=0;i<nv;i++){const g=gacc.get(key(i));const L=Math.hypot(g[0],g[1],g[2])||1;out[i*3]=g[0]/L;out[i*3+1]=g[1]/L;out[i*3+2]=g[2]/L;}
  prim.getAttribute('NORMAL').setArray(out);
}
function bark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){const ex=p.getExtras()||{};if(ex.atlasKind==='bark')return p;}}
function tris(doc){let t=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){t+=(p.getIndices()?.getCount()||0)/3;}return t;}

async function build(ratio, outname){
  const d=await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
  smoothNormals(bark(d));
  // weld whole doc, then simplify ONLY enough; leaves decimate fine too
  await d.transform(weld(), dedup(), simplify({simplifier:MeshoptSimplifier, ratio, error:0.02}), prune());
  await io.write(`scratch/${outname}`, d);
  const fs=await import('fs'); const sz=fs.statSync(`scratch/${outname}`).size;
  console.log(`${outname}: ratio=${ratio} → ${Math.round(tris(d))} tris, ${(sz/1e6).toFixed(2)} MB`);
}
const fs=await import('fs');
console.log('ORIGINAL lod0:', (fs.statSync('public/trees/ash_green/skeleton-1-lod0.glb').size/1e6).toFixed(2),'MB,', Math.round(tris(await io.read('public/trees/ash_green/skeleton-1-lod0.glb'))),'tris');
await build(0.5,  'LINDEN-ashgreen-FIXED-near.glb');
await build(0.15, 'LINDEN-ashgreen-FIXED-mid.glb');
await build(0.04, 'LINDEN-ashgreen-FIXED-far.glb');
