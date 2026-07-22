import { readFileSync } from 'node:fs'
const S='cartograph/data/ksi-y-m-yn'
const osm=JSON.parse(readFileSync(`${S}/raw/osm.json`,'utf8'))
const ov=JSON.parse(readFileSync(`${S}/building-overrides.json`,'utf8'))
const ids=new Set(ov.activate)
console.log('activates:',ov.activate)
// find what those osm ids are
const all=[...(osm.buildings||[]), ...(osm.ground?.building||[])]
for(const b of (osm.buildings||[])){
  const id = b.osmId!=null?`osm-${b.osmId}`:null
  if(id&&ids.has(id)) console.log(`  ${id} => name=${JSON.stringify(b.tags?.name)} type=${b.tags?.building} shop=${b.tags?.shop}`)
}
// what IS Galeria Lodzka's osm id?
for(const b of (osm.buildings||[])){
  const n=b.tags?.name||''
  if(/Galeria Łódzka/i.test(n)) console.log(`  FOUND building named "${n}" => osm-${b.osmId}  activated=${ids.has('osm-'+b.osmId)}`)
}
// listings addressed at Galeria Lodzka
const L=JSON.parse(readFileSync(`${S}/content/listings.json`,'utf8'))
const arr=Array.isArray(L)?L:(L.listings||[])
const g=arr.filter(l=>/Galeria Łódzka/i.test(JSON.stringify(l.address||'')+' '+(l.name||'')))
console.log(`\nlistings total=${arr.length}; mentioning "Galeria Łódzka" = ${g.length}`)
const byB={}
for(const l of g){ const k=l.buildingId||l.building||l.anchor||'(none)'; byB[k]=(byB[k]||0)+1 }
console.log('  grouped by building anchor:', byB)
