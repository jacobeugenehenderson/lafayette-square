import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const deg={};for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const inc=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+inc}}
const stems=[['Vail','vail'],['Kennett','kennett'],['Mackay','mackay'],['Waverly','waverly']]
for(const [lab,pat] of stems){
  console.log('=== '+lab+' ===')
  for(const s of R.streets){if(!new RegExp(pat,'i').test(s.name||s.skelId||''))continue;const p=s.points;const e0=p[0],e1=p[p.length-1]
    console.log(`  ${(s.skelId||s.name).padEnd(22)} ${p.length}pt  e0[${e0[0].toFixed(1)},${e0[1].toFixed(1)}]deg${deg[jKey(e0[0],e0[1])]}  e1[${e1[0].toFixed(1)},${e1[1].toFixed(1)}]deg${deg[jKey(e1[0],e1[1])]}  caps=${JSON.stringify(s.caps?{s:s.caps.start?.cap,e:s.caps.end?.cap}:s.capEnds||null)}`)
  }
}
