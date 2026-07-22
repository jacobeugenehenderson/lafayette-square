import { readFileSync, existsSync } from 'node:fs'
const D='cartograph/data'
const scenes=['lafayette-square','hipointe-demun','altadena','ksi-y-m-yn','centrum','toy']
const rd=p=>existsSync(p)?JSON.parse(readFileSync(p,'utf-8')):null
for(const s of scenes){
  const g=rd(`${D}/${s}/geography.json`), b=rd(`${D}/${s}/neighborhood_boundary.json`), n=rd(`${D}/${s}/neighborhood.json`)
  console.log(`\n===== ${s} =====`)
  if(!g){console.log('  no geography.json'); }
  else{
    const {minLat,maxLat,minLon,maxLon}=g.bbox
    const halfN=(maxLat-g.lat)*g.latToMeters, halfS=(g.lat-minLat)*g.latToMeters
    const halfE=(maxLon-g.lon)*g.lonToMeters, halfW=(g.lon-minLon)*g.lonToMeters
    const midLat=(minLat+maxLat)/2, midLon=(minLon+maxLon)/2
    const offM=Math.hypot((g.lat-midLat)*g.latToMeters,(g.lon-midLon)*g.lonToMeters)
    console.log(`  bbox half-extents from ORIGIN (m): N=${halfN.toFixed(0)} S=${halfS.toFixed(0)} E=${halfE.toFixed(0)} W=${halfW.toFixed(0)}`)
    console.log(`  origin offset from bbox center: ${offM.toFixed(0)} m`)
    const minHalf=Math.min(halfN,halfS,halfE,halfW)
    if(b?.radius!=null){
      const ok=b.radius<=minHalf
      console.log(`  radius=${b.radius}  vs tightest half-extent ${minHalf.toFixed(0)}  => bbox⊇disc: ${ok?'HOLDS':'*** VIOLATED by '+(b.radius-minHalf).toFixed(0)+' m ***'}`)
    }
  }
  if(b){
    console.log(`  boundary_json: polygon=${b.polygon?b.polygon.length+'pts':'ABSENT'} exclusions=${b.exclusions?b.exclusions.length:0} boundary=${b.boundary?.length} fade=${JSON.stringify(b.fade)} radius=${b.radius}`)
    if(b.center) console.log(`  boundary center=${JSON.stringify(b.center)}`)
    if(b.fade) console.log(`  => fade band is the outer ${(b.radius-b.fade.inner).toFixed(0)} m annulus only (${(100*(1-(b.fade.inner/b.radius)**2)).toFixed(1)}% of disc AREA)`)
  }
  if(n) console.log(`  neighborhood_json: polygon=${n.polygon?n.polygon.length+'pts':'ABSENT'} polygonSource=${n.polygonSource??'-'} sides=${n.sides?n.sides.length:'-'} borderStreets=${n.borderStreets?n.borderStreets.length:'-'} exclusions=${n.exclusions?n.exclusions.length:0} radius=${n.radius} committed=${n.committed}`)
  if(b&&n&&b.radius!==n.radius) console.log(`  *** RADIUS DISAGREEMENT: boundary=${b.radius} neighborhood=${n.radius} ***`)
  if(n?.polygon&&!b?.polygon) console.log(`  *** POLYGON IN neighborhood.json BUT NOT IN neighborhood_boundary.json ***`)
}
