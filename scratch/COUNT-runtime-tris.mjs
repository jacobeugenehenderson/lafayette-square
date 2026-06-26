import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { readFileSync, existsSync } from 'fs';
const j = JSON.parse(readFileSync('public/baked/default.json','utf8'));
const look='lafayette-square';
const io = new NodeIO().registerExtensions([EXTTextureWebP]);
function rt(u){ return u.startsWith('/trees/') ? `public/baked/${look}${u}` : 'public'+u; }
const triCache=new Map();
async function trisOf(u){
  if(triCache.has(u))return triCache.get(u);
  let path=rt(u.replace(/\?.*$/,''));
  let fallback=false;
  if(!existsSync(path)){ path='public'+u.replace(/\?.*$/,''); fallback=true; } // some species not copied to baked-look; runtime would 404 these
  let t=0;
  if(existsSync(path)){
    const doc=await io.read(path); const root=doc.getRoot();
    for(const m of root.listMeshes())for(const p of m.listPrimitives()){const idx=p.getIndices();const pos=p.getAttribute('POSITION');t+= idx? idx.getArray().length/3 : (pos?pos.getCount()/3:0);}
  } else { t=NaN; }
  triCache.set(u,{t,fallback,exists:existsSync(path)});
  return triCache.get(u);
}
// Replicate runtime URL resolution: inst.url (lod2), no lods -> fallback to url
let totalRuntime=0, totalAll=0, missingBaked=0;
const perSpecies={};
for(const inst of j.instances){
  const u=inst.url;
  const {t,exists}=await trisOf(u);
  if(!exists){ missingBaked++; }
  if(Number.isFinite(t)){ totalRuntime+=t; }
}
// Also: if all loaded from public/trees lod2 (the source copies), sum
console.log("placements:",j.instances.length);
console.log("default.json inst.url LOD: lod2 (no lods field present)");
console.log("Runtime path = /baked/lafayette-square/trees/... ; missing-from-baked-look placements:",missingBaked);
console.log("Total lod2 tris across all placements (using baked-look where present, else source lod2):", Math.round(totalRuntime).toLocaleString());
