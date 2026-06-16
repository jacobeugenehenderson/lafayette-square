import { buildTileGround } from '../src/lib/tileGround.js'
import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
// degrees
const deg={},pt={};for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const inc=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+inc;pt[k]=[p[i][0],p[i][1]]}}
// Vail Place streets
console.log('=== Vail Place segments ===')
for(const s of R.streets){if(!/vail/i.test(s.name||s.skelId||''))continue;const p=s.points;const e0=p[0],e1=p[p.length-1]
  console.log(`  ${s.skelId||s.name} ${p.length}pt  end0[${e0[0].toFixed(1)},${e0[1].toFixed(1)}]deg${deg[jKey(e0[0],e0[1])]}  end1[${e1[0].toFixed(1)},${e1[1].toFixed(1)}]deg${deg[jKey(e1[0],e1[1])]}  cap=${JSON.stringify(s.capEnds||s.caps?{start:s.caps?.start?.cap,end:s.caps?.end?.cap}:null)}`)
}
console.log('\n=== node degrees of interest ===')
for(const [x,z] of [[340.0,-120.6],[295.3,84.6]]) console.log(`  [${x},${z}] deg=${deg[jKey(x,z)]}`)
