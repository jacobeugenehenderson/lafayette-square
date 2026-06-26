import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function countPrim(doc){
  let v=0,t=0;
  for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
    const ex=p.getExtras()||{}; if(ex.atlasKind!=='bark')continue;
    v+=p.getAttribute('POSITION').getCount();
    const i=p.getIndices(); t+=i?i.getCount()/3:0;
  }
  return {v,t};
}
// helper: keep only bark prim by removing leaf prims
function stripToBark(doc){
  for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
    const ex=p.getExtras()||{}; if(ex.atlasKind!=='bark') p.dispose();
  }
}

async function load(){const d=await io.read('public/trees/ash_green/skeleton-1-lod0.glb');stripToBark(d);return d;}

let d = await load();
console.log('bark raw:', countPrim(d));

// 1. weld+dedup only
await d.transform(weld(), dedup());
console.log('after weld+dedup:', countPrim(d));

// 2. plain simplify ratio 0.01 (lockBorder default false)
let d2 = await load(); await d2.transform(weld(), dedup());
await d2.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.01, error:0.01}));
console.log('weld+simplify r=0.01 err=0.01:', countPrim(d2));

// 3. simplify with big error allowance
let d3 = await load(); await d3.transform(weld(), dedup());
await d3.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.01, error:0.5}));
console.log('weld+simplify r=0.01 err=0.5:', countPrim(d3));

// 4. WELD with high tolerance (merge near-coincident verts across seams) then simplify
let d4 = await load(); await d4.transform(weld({tolerance:1e-4}), dedup());
console.log('after weld(tol=1e-4):', countPrim(d4));
await d4.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.01, error:0.1}));
console.log('weld(tol=1e-4)+simplify r=0.01:', countPrim(d4));
