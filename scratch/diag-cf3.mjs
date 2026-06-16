import fs from 'fs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const { buildTileGround } = await import(ROOT + '/src/lib/tileGround.js')
const ribbons = JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const bnd = JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const design = JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const signedArea = (r) => { let a=0; for(let i=0;i<r.length;i++){const j=(i+1)%r.length; a += r[i][0]*r[j][1]-r[j][0]*r[i][1]} return a/2 }
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const mk=(sm)=>buildTileGround(ribbons,{stencil:clip,smooth:sm,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
function degen(rings){const f=[];for(const r of rings||[]){if(!r||r.length<3)continue;const a=Math.abs(signedArea(r));if(a>0.01&&a<8){let cx=0,cy=0;for(const p of r){cx+=p[0];cy+=p[1]}f.push({t:'ring',c:[cx/r.length,cy/r.length],a:+a.toFixed(3),n:r.length});continue}for(let i=0;i<r.length;i++){const p0=r[(i-1+r.length)%r.length],v=r[i],p1=r[(i+1)%r.length];const e1=dist(p0,v),e2=dist(v,p1);if(e1<1||e2<1||e1>60||e2>60)continue;const d=((v[0]-p0[0])/e1)*((p1[0]-v[0])/e2)+((v[1]-p0[1])/e1)*((p1[1]-v[1])/e2);if(Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI>165)f.push({t:'spur',c:v,ang:+(Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI).toFixed(1)})}}return f}
const f0=mk(0),f1=mk(1.5)
const b=degen(f0.curb), s=degen(f1.curb)
const near=(p,set)=>set.some(q=>dist(p,q.c)<5)
const NEW=s.filter(p=>!near(p.c,b))
console.log('NEW count', NEW.length)
for(const d of NEW) console.log(JSON.stringify(d))
