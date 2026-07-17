import fs from 'fs'
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json','utf8'))
const tiles = shape.tiles
const tipKey = (p) => Math.round(p[0]*1000)+','+Math.round(p[1]*1000)
const nodes = { 'Kennett×S18':[386.5,149], 'Mackay×Hickory':[29.3,-434.9], 'Rutger×S18':[453.6,-197] }
for (const [name,[nx,nz]] of Object.entries(nodes)) {
  const nk = tipKey([nx,nz])
  console.log(`\n=== ${name}  node=${nk} ===`)
  let hits=0
  for (let i=0;i<tiles.length;i++){
    const t=tiles[i]
    for (const run of (t.runs||[])){
      if (!run.poly || run.poly.length<2) continue
      for (const p of [run.poly[0], run.poly[run.poly.length-1]]){
        if (tipKey(p)===nk){
          hits++
          const wantKey = `${nk}|${run.skelId}|${run.side}`
          const has = (t.thruNodeEnds||[]).includes(wantKey)
          console.log(`  tile#${i}  run=${run.skelId}|${run.side}  wantKey="${wantKey}"  THIS-TILE-HAS-IT=${has}`)
          if(!has) console.log(`     tile#${i}.thruNodeEnds = ${JSON.stringify(t.thruNodeEnds||[])}`)
        }
      }
    }
  }
  if(!hits) console.log('  (no run endpoint found at this node — coordinate mismatch?)')
}
