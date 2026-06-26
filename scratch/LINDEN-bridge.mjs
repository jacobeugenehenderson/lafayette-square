import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function getBark(d){for(const m of d.getRoot().listMeshes())for(const p of m.listPrimitives())if((p.getExtras()||{}).atlasKind==='bark')return p;}
function angspan(a,b,c){ // min arc covering 3 angles (radians) -> degrees
  let A=[a,b,c].map(x=>(x+2*Math.PI)%(2*Math.PI)).sort((p,q)=>p-q);
  const gaps=[A[1]-A[0],A[2]-A[1],A[0]+2*Math.PI-A[2]];
  const maxGap=Math.max(...gaps);
  return (2*Math.PI-maxGap)*180/Math.PI;
}
async function analyze(label,glb){
  const d=await io.read(glb);const p=getBark(d);
  const pos=p.getAttribute('POSITION').getArray(),idx=p.getIndices().getArray();
  // trunk axis center from lower 30% of mesh
  let mnY=1e9,mxY=-1e9;const nv=pos.length/3;
  for(let i=0;i<nv;i++){mnY=Math.min(mnY,pos[i*3+1]);mxY=Math.max(mxY,pos[i*3+1]);}
  const yCut=mnY+(mxY-mnY)*0.3;
  let sx=0,sz=0,n=0;for(let i=0;i<nv;i++)if(pos[i*3+1]<yCut){sx+=pos[i*3];sz+=pos[i*3+2];n++;}
  const cx=sx/n,cz=sz/n;
  let bridge=0,lowTris=0;
  for(let t=0;t<idx.length/3;t++){const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];
    // only lower-trunk tris
    const ym=(pos[a*3+1]+pos[b*3+1]+pos[c*3+1])/3; if(ym>yCut)continue; lowTris++;
    const ang=v=>Math.atan2(pos[v*3+2]-cz,pos[v*3]-cx);
    if(angspan(ang(a),ang(b),ang(c))>120)bridge++;
  }
  console.log(`${label}: lowerTrunkTris=${lowTris} seamBridge(>120°arc)=${bridge} (${(bridge/lowTris*100).toFixed(1)}%)`);
}
await analyze('ORIG baked (HEAD)   ','scratch/ORIGBAKED-maple-lod0.glb');
await analyze('NEW baked (seamlock)','public/baked/lafayette-square/trees/maple_sugar/skeleton-1-lod0.glb');
