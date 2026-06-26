import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
import sharp from 'sharp';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}

function majorSeamLock(pos,uv,nv,thresh){
  const byPos=new Map();
  for(let i=0;i<nv;i++){const k=`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;let a=byPos.get(k);if(!a){a=[];byPos.set(k,a);}a.push(i);}
  const lock=new Uint8Array(nv);
  for(const arr of byPos.values()){if(arr.length<2)continue;let sp=0;
    for(let x=0;x<arr.length;x++)for(let y=x+1;y<arr.length;y++){const i=arr[x],j=arr[y];sp=Math.max(sp,Math.abs(uv[i*2]-uv[j*2]),Math.abs(uv[i*2+1]-uv[j*2+1]));}
    if(sp>thresh)for(const i of arr)lock[i]=1;}
  return lock;
}
// returns a doc with bark simplified
async function makeBark(ratio, lockThresh){
  const doc=await io.read('/tmp/salon-ash_green.glb'); smoothWeldBark(doc);
  const prim=getBark(doc);
  const pos=new Float32Array(prim.getAttribute('POSITION').getArray());
  const uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());
  const nv=pos.length/3;
  const isrc=prim.getIndices().getArray(); const indices=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
  const lock=lockThresh?majorSeamLock(pos,uv,nv,lockThresh):null;
  const target=Math.max(3,Math.floor(indices.length*ratio/3)*3);
  const res=MeshoptSimplifier.simplifyWithAttributes(indices,pos,3,uv,2,[1.0,1.0],lock,target,0.05,[]);
  prim.getIndices().setArray(res[0] instanceof Uint32Array?res[0]:new Uint32Array(res[0]));
  return {doc,prim,tris:res[0].length/3};
}
async function render(prim,outPath){
  const pos=prim.getAttribute('POSITION').getArray(),uv=prim.getAttribute('TEXCOORD_0').getArray(),nrm=prim.getAttribute('NORMAL').getArray(),idx=prim.getIndices().getArray();
  const timg=prim.getMaterial().getBaseColorTexture().getImage();
  const traw=await sharp(Buffer.from(timg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const TW=traw.info.width,TH=traw.info.height,tp=traw.data,ch=traw.info.channels;
  const st=(u,v)=>{u-=Math.floor(u);v-=Math.floor(v);const x=Math.min(TW-1,(u*TW)|0),y=Math.min(TH-1,((1-v)*TH)|0);const o=(y*TW+x)*ch;return[tp[o],tp[o+1],tp[o+2]];};
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;const nv=pos.length/3;
  for(let i=0;i<nv;i++){minX=Math.min(minX,pos[i*3]);maxX=Math.max(maxX,pos[i*3]);minY=Math.min(minY,pos[i*3+1]);maxY=Math.max(maxY,pos[i*3+1]);}
  const W=400,H=900;const cx=(minX+maxX)/2,cy=minY+(maxY-minY)*0.18;const spanY=(maxY-minY)*0.36,scale=H/spanY;
  const ts=(x,y)=>[(x-cx)*scale+W/2,H/2-(y-cy)*scale];
  const img=Buffer.alloc(W*H*3,18);const zb=new Float32Array(W*H).fill(-1e9);
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    const nz=(nrm[a*3+2]+nrm[b*3+2]+nrm[c*3+2])/3;if(nz<=0.05)continue;
    const P=[a,b,c].map(v=>ts(pos[v*3],pos[v*3+1])),Z=[a,b,c].map(v=>pos[v*3+2]),U=[a,b,c].map(v=>uv[v*2]),V=[a,b,c].map(v=>uv[v*2+1]);
    const mnx=Math.max(0,Math.floor(Math.min(P[0][0],P[1][0],P[2][0]))),mxx=Math.min(W-1,Math.ceil(Math.max(P[0][0],P[1][0],P[2][0])));
    const mny=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1]))),mxy=Math.min(H-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]);if(Math.abs(d)<1e-9)continue;
    for(let py=mny;py<=mxy;py++)for(let px=mnx;px<=mxx;px++){
      const w0=((P[1][0]-px)*(P[2][1]-py)-(P[2][0]-px)*(P[1][1]-py))/d,w1=((P[2][0]-px)*(P[0][1]-py)-(P[0][0]-px)*(P[2][1]-py))/d,w2=1-w0-w1;
      if(w0<0||w1<0||w2<0)continue;const z=w0*Z[0]+w1*Z[1]+w2*Z[2],o=py*W+px;if(z<=zb[o])continue;zb[o]=z;
      const u=w0*U[0]+w1*U[1]+w2*U[2],v=w0*V[0]+w1*V[1]+w2*V[2];const[r,g,bl]=st(u,v);const oo=o*3;img[oo]=r;img[oo+1]=g;img[oo+2]=bl;}}
  await sharp(img,{raw:{width:W,height:H,channels:3}}).png().toFile(outPath);
}
const A=await makeBark(0.05,0);    console.log('unlocked tris',A.tris);
const B=await makeBark(0.05,0.5);  console.log('seam-locked(0.5) tris',B.tris);
await render(A.prim,'scratch/LINDEN-cmp-UNLOCKED.png');
await render(B.prim,'scratch/LINDEN-cmp-LOCKED.png');
// side by side
await sharp({create:{width:820,height:900,channels:3,background:{r:0,g:0,b:0}}})
  .composite([{input:'scratch/LINDEN-cmp-UNLOCKED.png',left:0,top:0},{input:'scratch/LINDEN-cmp-LOCKED.png',left:420,top:0}])
  .png().toFile('scratch/LINDEN-cmp-SIDEBYSIDE.png');
console.log('wrote side-by-side (LEFT=unlocked, RIGHT=seam-locked)');
