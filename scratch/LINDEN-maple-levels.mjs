import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { smoothWeldBark } from '../arborist/decimate-tree.mjs';
import sharp from 'sharp';
await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const SRC='/tmp/salon-maple_sugar.glb';
function getBark(d){for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
function seamLock(pos,uv,nv,th){const bp=new Map();for(let i=0;i<nv;i++){const k=`${Math.round(pos[i*3]*1e4)},${Math.round(pos[i*3+1]*1e4)},${Math.round(pos[i*3+2]*1e4)}`;let a=bp.get(k);if(!a){a=[];bp.set(k,a);}a.push(i);}const lk=new Uint8Array(nv);for(const arr of bp.values()){if(arr.length<2)continue;let s=0;for(let x=0;x<arr.length;x++)for(let y=x+1;y<arr.length;y++){const i=arr[x],j=arr[y];s=Math.max(s,Math.abs(uv[i*2]-uv[j*2]),Math.abs(uv[i*2+1]-uv[j*2+1]));}if(s>th)for(const i of arr)lk[i]=1;}return lk;}
async function barkAt(ratio,lockTh){
  const doc=await io.read(SRC);smoothWeldBark(doc);const prim=getBark(doc);
  const pos=new Float32Array(prim.getAttribute('POSITION').getArray()),uv=new Float32Array(prim.getAttribute('TEXCOORD_0').getArray());const nv=pos.length/3;
  const isrc=prim.getIndices().getArray();const idx=isrc instanceof Uint32Array?isrc.slice():new Uint32Array(isrc);
  if(ratio<1){const lk=lockTh?seamLock(pos,uv,nv,lockTh):null;const tgt=Math.max(3,Math.floor(idx.length*ratio/3)*3);const r=MeshoptSimplifier.simplifyWithAttributes(idx,pos,3,uv,2,[1,1],lk,tgt,0.08,[]);prim.getIndices().setArray(r[0] instanceof Uint32Array?r[0]:new Uint32Array(r[0]));}
  return {prim,tris:prim.getIndices().getArray().length/3};
}
async function render(prim,out,rot=0.6){ // rot: view yaw so we see the wrap seam region
  const pos=prim.getAttribute('POSITION').getArray(),uv=prim.getAttribute('TEXCOORD_0').getArray(),nrm=prim.getAttribute('NORMAL').getArray(),idx=prim.getIndices().getArray();
  const traw=await sharp(Buffer.from(prim.getMaterial().getBaseColorTexture().getImage())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const TW=traw.info.width,TH=traw.info.height,tp=traw.data,ch=traw.info.channels;
  const samp=(u,v)=>{u-=Math.floor(u);v-=Math.floor(v);const x=Math.min(TW-1,(u*TW)|0),y=Math.min(TH-1,((1-v)*TH)|0);const o=(y*TW+x)*ch;return[tp[o],tp[o+1],tp[o+2]];};
  const cs=Math.cos(rot),sn=Math.sin(rot); // rotate about Y
  const tx=(x,y,z)=>[x*cs+z*sn, y, -x*sn+z*cs];
  let mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;const nv=pos.length/3;const PR=new Float32Array(nv*3);
  for(let i=0;i<nv;i++){const[a,b,c]=tx(pos[i*3],pos[i*3+1],pos[i*3+2]);PR[i*3]=a;PR[i*3+1]=b;PR[i*3+2]=c;mnX=Math.min(mnX,a);mxX=Math.max(mxX,a);mnY=Math.min(mnY,b);mxY=Math.max(mxY,b);}
  const W=360,H=760;const cx=(mnX+mxX)/2,cy=mnY+(mxY-mnY)*0.14;const spanY=(mxY-mnY)*0.26,scale=H/spanY;
  const ts=(x,y)=>[(x-cx)*scale+W/2,H/2-(y-cy)*scale];
  const img=Buffer.alloc(W*H*3,16);const zb=new Float32Array(W*H).fill(-1e9);
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    // rotated normal z
    const[,,naz]=tx(nrm[a*3],nrm[a*3+1],nrm[a*3+2]);if(naz<=0.05)continue;
    const P=[a,b,c].map(v=>ts(PR[v*3],PR[v*3+1])),Z=[a,b,c].map(v=>PR[v*3+2]),U=[a,b,c].map(v=>uv[v*2]),V=[a,b,c].map(v=>uv[v*2+1]);
    const mnx=Math.max(0,Math.floor(Math.min(P[0][0],P[1][0],P[2][0]))),mxx=Math.min(W-1,Math.ceil(Math.max(P[0][0],P[1][0],P[2][0])));
    const mny=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1]))),mxy=Math.min(H-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]);if(Math.abs(d)<1e-9)continue;
    // footprint: UV bbox vs screen bbox -> texels per screen pixel (mip approx)
    const uSpan=Math.max(U[0],U[1],U[2])-Math.min(U[0],U[1],U[2]),vSpan=Math.max(V[0],V[1],V[2])-Math.min(V[0],V[1],V[2]);
    const pxSpan=Math.max(1,(mxx-mnx)),pySpan=Math.max(1,(mxy-mny));
    const fpU=Math.min(0.5,uSpan/pxSpan),fpV=Math.min(0.5,vSpan/pySpan); // clamp
    const NS=Math.max(1,Math.min(5,Math.round(Math.max(fpU*TW,fpV*TH)/2))); // box samples per axis
    for(let py=mny;py<=mxy;py++)for(let px=mnx;px<=mxx;px++){
      const w0=((P[1][0]-px)*(P[2][1]-py)-(P[2][0]-px)*(P[1][1]-py))/d,w1=((P[2][0]-px)*(P[0][1]-py)-(P[0][0]-px)*(P[2][1]-py))/d,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
      const z=w0*Z[0]+w1*Z[1]+w2*Z[2],o=py*W+px;if(z<=zb[o])continue;zb[o]=z;
      const u=w0*U[0]+w1*U[1]+w2*U[2],v=w0*V[0]+w1*V[1]+w2*V[2];
      let R=0,G=0,B=0,cnt=0;
      for(let sy=0;sy<NS;sy++)for(let sx=0;sx<NS;sx++){const du=(sx/NS-0.5)*fpU,dv=(sy/NS-0.5)*fpV;const[r,g,bl]=samp(u+du,v+dv);R+=r;G+=g;B+=bl;cnt++;}
      const oo=o*3;img[oo]=R/cnt;img[oo+1]=G/cnt;img[oo+2]=B/cnt;}}
  await sharp(img,{raw:{width:W,height:H,channels:3}}).png().toFile(out);
}
const L=[{r:1.0,lk:0,n:'FULL'},{r:0.5,lk:0,n:'HALF-49K'},{r:0.15,lk:0,n:'CURRENT-13K'},{r:0.15,lk:0.5,n:'13K+SEAMLOCK'}];
const files=[];
for(const x of L){const {prim,tris}=await barkAt(x.r,x.lk);const f=`scratch/ml-${x.n}.png`;await render(prim,f);files.push({f,n:`${x.n} (${tris}t)`});console.log(files[files.length-1].n);}
await sharp({create:{width:370*L.length,height:760,channels:3,background:{r:0,g:0,b:0}}}).composite(files.map((x,i)=>({input:x.f,left:i*370,top:0}))).png().toFile('scratch/LINDEN-MAPLE-LEVELS.png');
console.log('→ LINDEN-MAPLE-LEVELS.png:', files.map(x=>x.n).join(' | '));
