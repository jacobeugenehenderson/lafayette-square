// diag-same.mjs <scene…> — the DIAGONAL corner is untouched by the perpendicular change: every painted layer (walk, lawn,
// land use, curb, asphalt, curb cuts) hashed under the painter at 20d3529f and under this tree, the town's norm with its style
// set to diagonal. --uncut sets the AUTHORED curb-cut styles aside (an authored perpendicular corner is perpendicular
// under any norm, so it is not part of this claim); every other authored value is kept. Read-only; through the shared feed, authoring loaded. Exits 1 on any difference.
import { createHash } from 'crypto'
import { pathToFileURL } from 'url'
import { feed } from '../_proto-feed.mjs'
const before = (await import(pathToFileURL(`${process.cwd()}/scratch/perp-depths-out/tileGround.base.mjs`).href)).buildTileGround
const after = (await import('../../src/lib/tileGround.js')).buildTileGround
let bad = 0
const uncut = process.argv.includes('--uncut')
for (const scene of process.argv.slice(2).filter(a => !a.startsWith('--'))) { const f = feed(scene)
  if (uncut) f.cornerCornerRadiusOverrides = Object.fromEntries(Object.entries(f.cornerCornerRadiusOverrides || {}).map(([k, v]) => [k, v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== 'cut')) : v]))
  const nm = { style: 'diagonal', width: 1.5, warningDepth: 0.6, source: 'trial', ...(f.ribbons.curbCutNorm?.crosswalks ? { crosswalks: f.ribbons.curbCutNorm.crosswalks } : {}) }
  const h = (fn) => { const prev = console.log; console.log = () => {}
    try { const R = fn({ ...f.ribbons, curbCutNorm: nm }, { grout: 'proto', smooth: 0, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth, blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse,
      cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides, cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale, protoProducer: true })
      return Object.fromEntries(['sidewalk', 'treelawnByLu', 'luByClass', 'curb', 'asphalt', 'curbCut'].map(k => [k, createHash('sha1').update(JSON.stringify(R[k] ?? null)).digest('hex').slice(0, 10)])) } finally { console.log = prev } }
  const a = h(before), b = h(after), diff = Object.keys(a).filter(k => a[k] !== b[k])
  if (diff.length) bad++
  console.log(`${scene} diagonal: ${diff.length ? `⛔ differs in ${diff.join(', ')}` : '✅ byte-identical'} (${Object.entries(b).map(([k, v]) => `${k} ${v}`).join(' · ')})`) }
process.exit(bad ? 1 : 0)
