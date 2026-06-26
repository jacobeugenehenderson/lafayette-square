import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('public/trees/ash_green/skeleton-1-lod0.glb');
let prim;
for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){const ex=p.getExtras()||{};if(ex.atlasKind==='bark')prim=p;}
const pos=prim.getAttribute('POSITION').getArray();
const nrm=prim.getAttribute('NORMAL')?.getArray();
const uv=prim.getAttribute('TEXCOORD_0').getArray();
const idx=prim.getIndices()?.getArray();
const nv=pos.length/3;
console.log('verts',nv,'tris', idx?idx.length/3:nv/3, 'hasNormal', !!nrm, 'indexed', !!idx);

const q=(x)=>Math.round(x*1e4); // 0.1mm quant
const setP=new Set(), setPN=new Set(), setPUV=new Set();
for(let i=0;i<nv;i++){
  const px=q(pos[i*3]),py=q(pos[i*3+1]),pz=q(pos[i*3+2]);
  setP.add(`${px},${py},${pz}`);
  if(nrm){const nx=Math.round(nrm[i*3]*100),ny=Math.round(nrm[i*3+1]*100),nz=Math.round(nrm[i*3+2]*100);setPN.add(`${px},${py},${pz}|${nx},${ny},${nz}`);}
  setPUV.add(`${px},${py},${pz}|${Math.round(uv[i*2]*1e4)},${Math.round(uv[i*2+1]*1e4)}`);
}
console.log('unique positions:', setP.size, `(${(setP.size/nv*100).toFixed(0)}% of verts)`);
console.log('unique pos+normal:', setPN.size);
console.log('unique pos+uv:', setPUV.size);

// flat-normal check: for a sample of tris, is the per-vertex normal == face normal?
if(nrm && idx){
  let flat=0, smooth=0;
  for(let t=0;t<Math.min(2000, idx.length/3);t++){
    const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2];
    const bx=pos[b*3],by=pos[b*3+1],bz=pos[b*3+2];
    const cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az, vx=cx-ax,vy=cy-ay,vz=cz-az;
    let fx=uy*vz-uz*vy, fy=uz*vx-ux*vz, fz=ux*vy-uy*vx; const L=Math.hypot(fx,fy,fz)||1; fx/=L;fy/=L;fz/=L;
    // normal at vert a
    const dot=nrm[a*3]*fx+nrm[a*3+1]*fy+nrm[a*3+2]*fz;
    if(dot>0.999) flat++; else smooth++;
  }
  console.log(`flat-normal sample: ${flat} flat / ${smooth} smooth (of ${flat+smooth})`);
}
