import sharp from 'sharp'
import fs from 'fs'
const base='public/baked/lafayette-square/trees/hero-impostor'
const CUT=0.4*255
for (const sp of fs.readdirSync(base)) {
  // combine the two leaf shells at az0 the way the render stacks them
  const files=['az0_leaf0.albedo.png','az0_leaf1.albedo.png']
  let W=0,H=0,acc=null
  for(const f of files){
    const p=`${base}/${sp}/${f}`
    if(!fs.existsSync(p)) continue
    const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true})
    W=info.width;H=info.height
    if(!acc) acc=new Uint8Array(W*H)
    for(let i=0;i<W*H;i++){const a=data[i*4+3]; if(a>CUT) acc[i]=1}
  }
  if(!acc) { console.log(sp,'no leaf files'); continue }
  // coverage + tight bbox of alpha
  let n=0,minX=W,maxX=-1,minY=H,maxY=-1
  const colHit=new Uint8Array(W), rowHit=new Uint8Array(H)
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(acc[y*W+x]){n++;colHit[x]=1;rowHit[y]=1;
    if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y}}
  // "dense core": the central span of columns whose fill exceeds 25% of the peak column
  const colFill=new Float64Array(W)
  for(let x=0;x<W;x++){let c=0;for(let y=0;y<H;y++)if(acc[y*W+x])c++;colFill[x]=c/H}
  const peak=Math.max(...colFill)
  let dMin=W,dMax=-1
  for(let x=0;x<W;x++) if(colFill[x]>0.25*peak){ if(x<dMin)dMin=x; if(x>dMax)dMax=x }
  console.log(sp.padEnd(18),
    `${W}x${H}`,
    'cov='+(100*n/(W*H)).toFixed(1)+'%',
    'bboxW='+(100*(maxX-minX+1)/W).toFixed(0)+'%',
    'bboxH='+(100*(maxY-minY+1)/H).toFixed(0)+'%',
    'fillInBbox='+(100*n/(((maxX-minX+1)*(maxY-minY+1))||1)).toFixed(1)+'%',
    'denseCoreW='+(dMax>=dMin?(100*(dMax-dMin+1)/W).toFixed(0):'-')+'%',
    'peakColFill='+(100*peak).toFixed(0)+'%')
}
