import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
import sharp from 'sharp';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(d){for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
async function barkAt(ratio){
  const doc=await io.read('/tmp/salon-ash_green.glb'); smoothWeldBark(doc);
  const prim=getBark(doc);
  const pos=new Float32Array(prim.getAttribute('POSITION').getArray()),uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());
  const isrc=prim.getIndices().getArray(); const idx=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
  if(ratio<1){const tgt=Math.max(3,Math.floor(idx.length*ratio/3)*3);const r=MeshoptSimplifier.simplifyWithAttributes(idx,pos,3,uv,2,[1,1],null,tgt,0.08,[]);prim.getIndices().setArray(r[0] instanceof Uint32Array?r[0]:new Uint32Array(r[0]));}
  return {prim,tris:prim.getIndices().getArray().length/3};
}
async function render(prim,out){
  const pos=prim.getAttribute('POSITION').getArray(),uv=prim.getAttribute('TEXCOORD_0').getArray(),nrm=prim.getAttribute('NORMAL').getArray(),idx=prim.getIndices().getArray();
  const traw=await sharp(Buffer.from(prim.getMaterial().getBaseColorTexture().getImage())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const TW=traw.info.width,TH=traw.info.height,tp=traw.data,ch=traw.info.channels;
  const st=(u,v)=>{u-=Math.floor(u);v-=Math.floor(v);const x=Math.min(TW-1,(u*TW)|0),y=Math.min(TH-1,((1-v)*TH)|0);const o=(y*TW+x)*ch;return[tp[o],tp[o+1],tp[o+2]];};
  let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;const nv=pos.length/3;
  for(let i=0;i<nv;i++){mnX=Math.min(mnX,pos[i*3]);mxX=Math.max(mxX,pos[i*3]);mnY=Math.min(mnY,pos[i*3+1]);mxY=Math.max(mxY,pos[i*3+1]);}
  const W=380,H=820;const cx=(mnX+mxX)/2,cy=mnY+(mxY-mnY)*0.16;const spanY=(mxY-mnY)*0.30,scale=H/spanY;
  const ts=(x,y)=>[(x-cx)*scale+W/2,H/2-(y-cy)*scale];
  const img=Buffer.alloc(W*H*3,18);const zb=new Float32Array(W*H).fill(-1e9);
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];const nz=(nrm[a*3+2]+nrm[b*3+2]+nrm[c*3+2])/3;if(nz<=0.05)continue;
    const P=[a,b,c].map(v=>ts(pos[v*3],pos[v*3+1])),Z=[a,b,c].map(v=>pos[v*3+2]),U=[a,b,c].map(v=>uv[v*2]),Vv=[a,b,c].map(v=>uv[v*2+1]);
    const mnx=Math.max(0,Math.floor(Math.min(P[0][0],P[1][0],P[2][0]))),mxx=Math.min(W-1,Math.ceil(Math.max(P[0][0],P[1][0],P[2][0])));
    const mny=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1]))),mxy=Math.min(H-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]);if(Math.abs(d)<1e-9)continue;
    for(let py=mny;py<=mxy;py++)for(let px=mnx;px<=mxx;px++){const w0=((P[1][0]-px)*(P[2][1]-py)-(P[2][0]-px)*(P[1][1]-py))/d,w1=((P[2][0]-px)*(P[0][1]-py)-(P[0][0]-px)*(P[2][1]-py))/d,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;const z=w0*Z[0]+w1*Z[1]+w2*Z[2],o=py*W+px;if(z<=zb[o])continue;zb[o]=z;const u=w0*U[0]+w1*U[1]+w2*U[2],v=w0*Vv[0]+w1*Vv[1]+w2*Vv[2];const[r,g,bl]=st(u,v);const oo=o*3;img[oo]=r;img[oo+1]=g;img[oo+2]=bl;}}
  await sharp(img,{raw:{width:W,height:H,channels:3}}).png().toFile(out);
}
const ratios=[1.0,0.5,0.15,0.05];const files=[];
for(const r of ratios){const {prim,tris}=await barkAt(r);const f=`scratch/sw-${r}.png`;await render(prim,f);files.push({f,label:`r=${r} ${tris}t`});console.log(files[files.length-1].label);}
const comp=files.map((x,i)=>({input:x.f,left:i*390,top:0}));
await sharp({create:{width:390*ratios.length,height:820,channels:3,background:{r:0,g:0,b:0}}}).composite(comp).png().toFile('scratch/LINDEN-SWEEP.png');
console.log('wrote LINDEN-SWEEP.png — left→right:', files.map(x=>x.label).join(' | '));
