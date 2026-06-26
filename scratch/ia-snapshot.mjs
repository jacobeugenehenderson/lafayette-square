// Snapshot iA (the frozen curb) per spur tile from shape.json, for the byte-identity gate.
import fs from 'fs'
const path = process.argv[2] || 'public/baked/lafayette-square/shape.json'
const shape = JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url)))
const SPUR = [2,3,4,9,10,11,12,23,25,30,33,35,38,39,40,42,43,53,66,69,80]
const out = {}
shape.tiles.forEach((st,ti)=>{
  // hash iA precisely (rounded to 1e-3 m)
  const r = (st.iA||[]).map(ring=>ring.map(p=>[Math.round(p[0]*1000),Math.round(p[1]*1000)]))
  out[ti] = { isSpur: SPUR.includes(ti), nRings: r.length, nVerts: r.reduce((a,x)=>a+x.length,0), hash: JSON.stringify(r) }
})
console.log(JSON.stringify(out))
