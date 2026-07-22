import { readFileSync, existsSync } from 'node:fs'
const S='cartograph/data/ksi-y-m-yn'
const nb=JSON.parse(readFileSync(`${S}/neighborhood_boundary.json`,'utf8'))
const n=JSON.parse(readFileSync(`${S}/neighborhood.json`,'utf8'))
const geo=JSON.parse(readFileSync(`${S}/geography.json`,'utf8'))
function wgs84ToLocal(g,lon,lat){return [(lon-g.lon)*g.lonToMeters, -(lat-g.lat)*g.latToMeters]}
function pip(px,pz,poly){let i2=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];const xi=a.x??a[0],zi=a.z??a[1],xj=b.x??b[0],zj=b.z??b[1];if((zi>pz)!==(zj>pz)&&px<((xj-xi)*(pz-zi))/(zj-zi)+xi)i2=!i2}return i2}
const polyXZ=n.polygon.map(a=>{const[x,z]=wgs84ToLocal(geo,a.lon,a.lat);return{x,z}})
console.log(`neighborhood.json polygon: ${n.polygon.length} pts, source=${n.polygonSource}`)
console.log(`neighborhood_boundary.json polygon: ${nb.polygon?nb.polygon.length:'ABSENT'}  radius=${nb.radius}`)
// load buildings from map.json (post-clip) and raw osm (pre-clip)
const rawP=`${S}/raw/osm.json`, mapP=`${S}/clean/map.json`
for(const [label,p] of [['raw/osm.json',rawP],['clean/map.json',mapP]]){
  if(!existsSync(p)){console.log(`  ${label}: missing`);continue}
  const j=JSON.parse(readFileSync(p,'utf8'))
  const bl=j.buildings||[]
  let inPoly=0,inDisc=0,both=0,total=0
  const R2=nb.radius**2, cx=nb.center?.[0]??0, cz=nb.center?.[1]??0
  for(const b of bl){
    const pts=b.coords||b.ring||(b.rings&&b.rings[0])||b.footprint||[]
    if(pts.length<3)continue
    total++
    let sx=0,sz=0;for(const q of pts){sx+=(q.x??q[0]);sz+=(q.z??q[1])}
    const bx=sx/pts.length,bz=sz/pts.length
    const ip=pip(bx,bz,polyXZ), id=(bx-cx)**2+(bz-cz)**2<=R2
    if(ip)inPoly++; if(id)inDisc++; if(ip&&id)both++
  }
  console.log(`  ${label}: total=${total}  in POLYGON=${inPoly}  in DISC(r=${nb.radius})=${inDisc}  both=${both}`)
  console.log(`     => disc admits ${inDisc-both} buildings the polygon would EXCLUDE; polygon would admit ${inPoly-both} the disc excludes`)
}
