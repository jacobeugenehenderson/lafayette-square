import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(doc){for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}

async function render(glbPath, outPath){
  const doc=await io.read(glbPath);
  const prim=getBark(doc);
  const pos=prim.getAttribute('POSITION').getArray();
  const uv=prim.getAttribute('TEXCOORD_0').getArray();
  const nrm=prim.getAttribute('NORMAL')?.getArray();
  const idx=prim.getIndices().getArray();
  // texture
  const tex=prim.getMaterial().getBaseColorTexture();
  const timg=tex.getImage();
  const traw=await sharp(Buffer.from(timg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const TW=traw.info.width, TH=traw.info.height, tp=traw.data;
  const sampleTex=(u,v)=>{ // REPEAT wrap
    u=u-Math.floor(u); v=v-Math.floor(v);
    const x=Math.min(TW-1,Math.max(0,(u*TW)|0)), y=Math.min(TH-1,Math.max(0,((1-v)*TH)|0));
    const o=(y*TW+x)*traw.info.channels; return [tp[o],tp[o+1],tp[o+2]];
  };
  // bounds
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
  const nv=pos.length/3;
  for(let i=0;i<nv;i++){minX=Math.min(minX,pos[i*3]);maxX=Math.max(maxX,pos[i*3]);minY=Math.min(minY,pos[i*3+1]);maxY=Math.max(maxY,pos[i*3+1]);minZ=Math.min(minZ,pos[i*3+2]);maxZ=Math.max(maxZ,pos[i*3+2]);}
  // orthographic FRONT view (look down -Z): screen x=X, y=Y(up). Keep front-facing (normal.z>0), z-test nearest (max Z).
  const W=700,H=900;
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const trunkTop=minY+(maxY-minY)*0.12; const spanY=(trunkTop-minY)*1.05, scale=H/spanY;
  const toScreen=(x,y)=>[ (x-cx)*scale + W/2, H/2 - (y-cy)*scale ];
  const img=Buffer.alloc(W*H*3, 20); const zbuf=new Float32Array(W*H).fill(-1e9);
  for(let t=0;t<idx.length/3;t++){
    const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    // front-face cull: average normal z (fallback geometric)
    let nz; if(nrm) nz=(nrm[a*3+2]+nrm[b*3+2]+nrm[c*3+2])/3; else nz=1;
    if(nz<=0.05) continue;
    const P=[a,b,c].map(v=>toScreen(pos[v*3],pos[v*3+1]));
    const Z=[a,b,c].map(v=>pos[v*3+2]);
    const U=[a,b,c].map(v=>uv[v*2]), V=[a,b,c].map(v=>uv[v*2+1]);
    const minx=Math.max(0,Math.floor(Math.min(P[0][0],P[1][0],P[2][0]))), maxx=Math.min(W-1,Math.ceil(Math.max(P[0][0],P[1][0],P[2][0])));
    const miny=Math.max(0,Math.floor(Math.min(P[0][1],P[1][1],P[2][1]))), maxy=Math.min(H-1,Math.ceil(Math.max(P[0][1],P[1][1],P[2][1])));
    const d=(P[1][0]-P[0][0])*(P[2][1]-P[0][1])-(P[2][0]-P[0][0])*(P[1][1]-P[0][1]); if(Math.abs(d)<1e-9)continue;
    for(let py=miny;py<=maxy;py++)for(let px=minx;px<=maxx;px++){
      const w0=((P[1][0]-px)*(P[2][1]-py)-(P[2][0]-px)*(P[1][1]-py))/d;
      const w1=((P[2][0]-px)*(P[0][1]-py)-(P[0][0]-px)*(P[2][1]-py))/d;
      const w2=1-w0-w1; if(w0<0||w1<0||w2<0)continue;
      const z=w0*Z[0]+w1*Z[1]+w2*Z[2]; const o=py*W+px;
      if(z<=zbuf[o])continue; zbuf[o]=z;
      const u=w0*U[0]+w1*U[1]+w2*U[2], v=w0*V[0]+w1*V[1]+w2*V[2];
      const[r,g,bl]=sampleTex(u,v); const oo=o*3; img[oo]=r;img[oo+1]=g;img[oo+2]=bl;
    }
  }
  await sharp(img,{raw:{width:W,height:H,channels:3}}).png().toFile(outPath);
  console.log('wrote', outPath, `(${idx.length/3} bark tris)`);
}
await render('public/trees/ash_green/skeleton-1-lod0.glb','scratch/LINDEN-base-lod0.png');
await render('public/trees/ash_green/skeleton-1-lod2.glb','scratch/LINDEN-base-lod2.png');
