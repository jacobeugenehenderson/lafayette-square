import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { readFileSync } from 'fs';

const j = JSON.parse(readFileSync('public/baked/lafayette-square/trees.json','utf8'));
const urls = [...new Set(j.instances.map(i=>i.url.replace(/\?.*$/,'')))].sort();
const io = new NodeIO().registerExtensions([EXTTextureWebP]);

let problems = [];
let summary = [];
for (const u of urls) {
  const path = 'public' + u;
  let doc;
  try { doc = await io.read(path); }
  catch(e){ problems.push(`PARSE-FAIL ${u}: ${e.message}`); continue; }
  const root = doc.getRoot();
  let totalPrims=0, totalTris=0, semSet=new Set();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      totalPrims++;
      const pos = prim.getAttribute('POSITION');
      if (!pos) { problems.push(`NO-POSITION ${u} mesh=${mesh.getName()}`); continue; }
      const pc = pos.getCount();
      if (pc === 0) problems.push(`EMPTY-PRIM ${u} mesh=${mesh.getName()} pos.count=0`);
      const sems = prim.listSemantics();
      sems.forEach(s=>semSet.add(s));
      for (const sem of sems) {
        const a = prim.getAttribute(sem);
        if (a.getCount() !== pc) problems.push(`ATTR-COUNT ${u} mesh=${mesh.getName()} ${sem}=${a.getCount()} vs POSITION=${pc}`);
      }
      const parr = pos.getArray();
      for (let i=0;i<parr.length;i++){ if(!Number.isFinite(parr[i])){ problems.push(`POS-NAN ${u} mesh=${mesh.getName()}`); break; } }
      const idx = prim.getIndices();
      if (idx) {
        const ia = idx.getArray();
        if (ia.length === 0) problems.push(`EMPTY-INDICES ${u} mesh=${mesh.getName()}`);
        totalTris += ia.length/3;
        let maxI=-1; for(let i=0;i<ia.length;i++){ if(ia[i]>maxI)maxI=ia[i]; }
        if (maxI >= pc) problems.push(`IDX-OOR ${u} mesh=${mesh.getName()} maxIdx=${maxI} pc=${pc}`);
      } else { totalTris += pc/3; }
    }
  }
  summary.push(`${u}  prims=${totalPrims} tris=${Math.round(totalTris)} sems=[${[...semSet].sort().join(',')}]`);
}

console.log("Validated", urls.length, "GLBs\n");
console.log(summary.join("\n"));
console.log("\n=== PROBLEMS ===");
if (problems.length===0) console.log("NONE");
else problems.forEach(p=>console.log(" -",p));
