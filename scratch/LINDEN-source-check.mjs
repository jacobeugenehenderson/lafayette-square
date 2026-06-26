import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function analyze(label, path){
  try{
    const doc=await io.read(path);
    for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
      const ex=p.getExtras()||{};
      const pos=p.getAttribute('POSITION'); if(!pos)continue;
      const idx=p.getIndices(); const nv=pos.getCount(); const nt=idx?idx.getCount()/3:nv/3;
      // unique positions
      const a=pos.getArray(); const sp=new Set();
      for(let i=0;i<nv;i++)sp.add(`${Math.round(a[i*3]*1e4)},${Math.round(a[i*3+1]*1e4)},${Math.round(a[i*3+2]*1e4)}`);
      const ratio=(nv/sp.size).toFixed(2);
      console.log(`${label} :: prim kind=${ex.atlasKind||'?'} verts=${nv} uniqPos=${sp.size} (${ratio}x split) tris=${Math.round(nt)}`);
    }
  }catch(e){console.log(label,'ERR',e.message);}
}
await analyze('ash_green SOURCE chassis?', 'public/trees/_chassis/ash_green.glb');
