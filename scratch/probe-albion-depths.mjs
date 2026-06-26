import fs from 'fs'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const st = shape.tiles[53]
const cw = 0.15
// replicate edgeDepth + gleanTreelawn minimally
for(const r of st.runs){
  if(r.skelId!=='albion-place' && r.skelId!=='missouri-avenue-2') continue
  const bm = r.baseMeasure, m = r.measure
  console.log(`${r.skelId}/${r.side} segOrd=${r.segOrd}`)
  console.log(`   baseMeasure[${r.side}]: pavementHW=${bm[r.side]?.pavementHW?.toFixed(2)} tl=${bm[r.side]?.treelawn} sw=${bm[r.side]?.sidewalk} term=${bm[r.side]?.terminal}`)
}
