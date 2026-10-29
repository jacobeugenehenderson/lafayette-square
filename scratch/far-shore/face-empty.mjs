// face-empty.mjs — why does an armoured face build no far geometry? Per face with armour: the stations the revetment
// marks armoured, the drape stations whose crest is ≥ one course (non-bare), the longest non-bare run in drape stations,
// and the far/near triangle counts. ▶ node scratch/far-shore/face-empty.mjs --look=provincetown --face=1:left
import { readFileSync } from 'node:fs'
import { prepareFaces, FAR_OCTAVES, NEAR_OCTAVES } from '../../cartograph/bake-revetment-far.js'
import { drapeGlobals, revetmentDrape } from '../../src/lib/revetmentDrape.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
const arg = (n) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const look = arg('look'), only = arg('face'), dir = `public/baked/${look}`
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const { faces } = prepareFaces({ revetment: JSON.parse(readFileSync(`${dir}/revetment.json`, 'utf8')), terrainJson: JSON.parse(readFileSync(`${dir}/terrain.json`, 'utf8')),
  terrainBin: ab(`${dir}/terrain.bin`), groundJson: JSON.parse(readFileSync(`${dir}/ground.json`, 'utf8')), groundBin: ab(`${dir}/ground.bin`) })
for (const f of faces) { if (only && f.key !== only) continue
  const armSt = f.stations.filter(s => s.armour ?? s.armoured ?? s.a).length
  const row = { key: f.key, stations: f.stations.length, armouredStations: armSt, stationKeys: Object.keys(f.stations[0] || {}).join(',') }
  for (const oct of [FAR_OCTAVES, NEAR_OCTAVES]) {
    const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, ...(oct === NEAR_OCTAVES ? { toeAt: f.toeAt, berm: f.berm } : {}), octaves: oct })
    let nb = 0, run = 0, best = 0, maxH = 0
    for (let i = 0; i < G.nAlong; i++) { const h = f.crestAt(i / (G.nAlong - 1)); maxH = Math.max(maxH, h); if (h >= MIN_ARMOUR_D50_M) { nb++; run++; best = Math.max(best, run) } else run = 0 }
    const d = oct === FAR_OCTAVES || only ? revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: oct, globals: G }) : null
    row[`oct${oct}`] = `${G.nAlong} stations, step ${G.step.toFixed(2)} m, nAcross ${G.nAcross} · non-bare ${nb}, longest run ${best} · max crest ${maxH.toFixed(2)} m${d ? ` · ${d.stats.tris} tris` : ''}`
  }
  console.log(JSON.stringify(row, null, 1))
}
