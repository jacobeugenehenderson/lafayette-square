import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { readFileSync, existsSync } from 'fs';

const j = JSON.parse(readFileSync('public/baked/default.json','utf8'));
const look = 'lafayette-square';
const urls = [...new Set(j.instances.map(i=>(i.url||'').replace(/\?.*$/,'')))].sort();
const io = new NodeIO().registerExtensions([EXTTextureWebP]);

let missing=[], problems=[], ok=[];
for (const u of urls) {
  const path = u.startsWith('/trees/') ? `public/baked/${look}${u}` : 'public'+u;
  if (!existsSync(path)) { missing.push(path); continue; }
  let doc;
  try { doc = await io.read(path); } catch(e){ problems.push(`PARSE-FAIL ${path}: ${e.message}`); continue; }
  const root=doc.getRoot();
  let prims=0,sems=new Set(),tris=0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()){
    prims++;
    const pos=prim.getAttribute('POSITION');
    if(!pos){problems.push(`NO-POS ${path}`);continue;}
    const pc=pos.getCount();
    if(pc===0)problems.push(`EMPTY ${path}`);
    for(const s of prim.listSemantics()){sems.add(s);const a=prim.getAttribute(s);if(a.getCount()!==pc)problems.push(`ATTR-COUNT ${path} ${s}=${a.getCount()} vs ${pc}`);}
    const idx=prim.getIndices();
    if(idx){const ia=idx.getArray();let mx=-1;for(let i=0;i<ia.length;i++)if(ia[i]>mx)mx=ia[i];if(mx>=pc)problems.push(`IDX-OOR ${path} ${mx}>=${pc}`);tris+=ia.length/3;}
  }
  ok.push(`${path.replace('public/baked/'+look,'')}  prims=${prims} tris=${Math.round(tris)} sems=[${[...sems].sort().join(',')}]`);
}
console.log("MISSING (",missing.length,"):"); missing.forEach(m=>console.log("  ",m));
console.log("\nPROBLEMS (",problems.length,"):"); problems.forEach(p=>console.log("  ",p));
console.log("\nOK (",ok.length,"):"); ok.forEach(o=>console.log("  ",o));
