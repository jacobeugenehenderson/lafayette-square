import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(d){let best=null;for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives()){const k=(p.getExtras()||{}).atlasKind;if(k==='bark')return p;if(!best)best=p;}return best;}
async function render(glb,out){
  const doc=await io.read(glb);const prim=getBark(doc);
  const pos=prim.getAttribute('POSITION').getArray(),uv=prim.getAttribute('TEXCOORD_0').getArray(),idx=prim.getIndices().getArray();
  const nrm=prim.getAttribute('NORMAL')?.getArray();
  const tex=prim.getMaterial()?.getBaseColorTexture();const timg=tex?.getImage();
  if(!timg){console.log('NO embedded tex for',glb,'- material:',prim.getMaterial()?.getName());return;}
  const traw=await sharp(Buffer.from(timg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const TW=traw.info.width,TH=traw.info.height,tp=traw.data,ch=traw.info.channels;
  const st=(u,v)=>{u-=Math.floor(u);v-=Math.floor(v);const x=Math.min(TW-1,(u*TW)|0),y=Math.min(TH-1,((1-v)*TH)|0);const o=(y*TW+x)*ch;return[tp[o],tp[o+1],tp[o+2]];};
  let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;const nv=pos.length/3;
  for(let i=0;i<nv;i++){mnX=Math.min(mnX,pos[i*3]);mxX=Math.max(mxX,pos[i*3]);mnY=Math.min(mnY,pos[i*3+1]);mxY=Math.max(mxY,pos[i*3+1]);}
  const W=380,H=820;const cx=(mnX+mxX)/2,cy=mnY+(mxY-mnY)*0.16;const spanY=(mxY-mnY)*0.30,scale=H/spanY;
  const ts=(x,y)=>[(x-cx)*scale+W/2,H/2-(y-cy)*scale];
  const img=Buffer.alloc(W*H*3,18);const zb=new Float32Array(W*H).fill(-1e9);
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];const nz=nrm?(nrm[a*3+2]+nrm[b*3+2]+nrm[c*3+2])/3:1;if(nz<=0.05)continue;
    const P=[a,b,c].map(v=>ts(pos[v*3],pos[v*3+1])),Z=[a,b,c].map(v=>pos[v*3+2]),U=[a,b,c].map(v=>uv[v*2]),Vv=[a,b,c].map(v=>uv[v*2+1]);
    const mnx=Math.max(0,Math.floor(Math.min(P[0][0],P[1][0],P[2][0]))),mxx=Math.min(W-1,Math.ceil(Math.max(P[0][0],P[1][0],P[2][0])));
    const mny=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1]))),mxy=Math.min(H-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]);if(Math.abs(d)<1e-9)continue;
    for(let py=mny;py<=mxy;py++)for(let px=mnx;px<=mxx;px++){const w0=((P[1][0]-px)*(P[2][1]-py)-(P[2][0]-px)*(P[1][1]-py))/d,w1=((P[2][0]-px)*(P[0][1]-py)-(P[0][0]-px)*(P[2][1]-py))/d,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;const z=w0*Z[0]+w1*Z[1]+w2*Z[2],o=py*W+px;if(z<=zb[o])continue;zb[o]=z;const u=w0*U[0]+w1*U[1]+w2*U[2],v=w0*Vv[0]+w1*Vv[1]+w2*Vv[2];const[r,g,bl]=st(u,v);const oo=o*3;img[oo]=r;img[oo+1]=g;img[oo+2]=bl;}}
  await sharp(img,{raw:{width:W,height:H,channels:3}}).png().toFile(out);console.log('wrote',out,idx.length/3,'tris');
}
await render('scratch/ORIGBAKED-maple_sugar-lod0.glb','scratch/LINDEN-ORIG-maple-lod0.png');
await render('public/baked/lafayette-square/trees/maple_sugar/skeleton-1-lod0.glb','scratch/LINDEN-NEW-maple-lod0.png');
await sharp({create:{width:780,height:820,channels:3,background:{r:0,g:0,b:0}}}).composite([{input:'scratch/LINDEN-ORIG-maple-lod0.png',left:0,top:0},{input:'scratch/LINDEN-NEW-maple-lod0.png',left:400,top:0}]).png().toFile('scratch/LINDEN-ORIGvsNEW.png');
console.log('LEFT=ORIGINAL(HEAD)  RIGHT=NEW(mine)');
