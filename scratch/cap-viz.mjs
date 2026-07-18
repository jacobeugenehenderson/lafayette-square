// cap-viz.mjs — render the cul-de-sac cap region to an SVG so the geometry can
// be SEEN (breaks the blind-iteration cycle on the cap slope). Renders
// buildTileGround's FILL (asphalt / curb / treelawn / sidewalk) around a chosen
// dead-end tip, with an optional cap flip. Read the SVG to inspect the slope.
//   node scratch/cap-viz.mjs [skelId:capEnd] [flip|noflip]
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { CAP_SEGORD } from '../src/lib/feCustomKey.js'

const arg = process.argv[2] || 'south-18th-street-3:end'
const doFlip = (process.argv[3] || 'flip') !== 'noflip'
const [skelId, capEnd] = arg.split(':')

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
// tip coord
let tip = null
for (const t of ribbons.tiles) for (const c of (t.caps || [])) if (c.skelId === skelId && c.capEnd === capEnd) tip = t.ring[c.vertexIdx]
if (!tip) { console.error('no cap', arg); process.exit(1) }

const bc = doFlip ? { [skelId]: { left: { [CAP_SEGORD[capEnd]]: { capFlip: true } } } } : null
const orig = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true, blockCustoms: bc })
console.log = orig

// viewport: 22m box around the tip
const R = 45, S = 900 / (2 * R)   // px per meter
const toPx = (p) => [(p[0] - tip[0] + R) * S, (p[1] - tip[1] + R) * S]   // note: +z downward in image
const path = (rings, fill) => (rings || [])
  .map(r => 'M' + r.map(p => { const q = toPx(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1) }).join('L') + 'Z')
  .join(' ')
const layer = (rings, fill) => rings && rings.length ? `<path d="${path(rings, fill)}" fill="${fill}" fill-rule="evenodd" stroke="none"/>` : ''

const tlRings = Object.values(g.treelawnByLu || {}).flat()
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
<rect width="900" height="900" fill="#7CB07C"/>
${layer(g.asphalt, '#444')}
${layer(g.curb, '#c8b89a')}
${layer(tlRings, '#5a8a3c')}
${layer(g.sidewalk, '#eee')}
<circle cx="${toPx(tip)[0]}" cy="${toPx(tip)[1]}" r="3" fill="red"/>
<text x="6" y="18" font-size="14" fill="#000">${arg} ${doFlip ? 'FLIPPED' : 'default'} — green=treelawn white=sidewalk gray=asphalt tan=curb red=tip</text>
</svg>`
const out = `scratch/cap-viz.svg`
fs.writeFileSync(out, svg)
console.log(`wrote ${out}  (tip=${tip.map(v => v.toFixed(1))}, ${doFlip ? 'flipped' : 'default'})`)
