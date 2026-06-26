import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function analyze(label, path){
  const doc=await io.read(path);
  for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
    const pos=p.getAttribute('POSITION'); if(!pos)continue;
    const nrm=p.getAttribute('NORMAL'); const idx=p.getIndices(); const nv=pos.getCount(); const nt=idx?idx.getCount()/3:nv/3;
    const a=pos.getArray(); const sp=new Set();
    for(let i=0;i<nv;i++)sp.add(`${Math.round(a[i*3]*1e4)},${Math.round(a[i*3+1]*1e4)},${Math.round(a[i*3+2]*1e4)}`);
    // flat check
    let flat=0,sm=0;
    if(nrm&&idx){const N=nrm.getArray();for(let t=0;t<Math.min(2000,idx.getCount()/3);t++){const x=idx.getArray();const A=x[t*3];
      const ax=a[A*3],ay=a[A*3+1],az=a[A*3+2];const B=x[t*3+1],C=x[t*3+2];
      const ux=a[B*3]-ax,uy=a[B*3+1]-ay,uz=a[B*3+2]-az,vx=a[C*3]-ax,vy=a[C*3+1]-ay,vz=a[C*3+2]-az;
      let fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;const L=Math.hypot(fx,fy,fz)||1;
      const d=(N[A*3]*fx+N[A*3+1]*fy+N[A*3+2]*fz)/L; if(d>0.999)flat++;else sm++;}}
    console.log(`${label}: verts=${nv} uniqPos=${sp.size} (${(nv/sp.size).toFixed(2)}x) tris=${Math.round(nt)} hasNrm=${!!nrm} flat=${flat}/${flat+sm}`);
  }
}
await analyze('white_oak_a (chassis src)','public/trees/_chassis/white_oak_a.glb');
