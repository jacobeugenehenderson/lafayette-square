// Marker probe: render what is under each of Jacob's marker strokes.
// Draws the LIVE cartograph map (map.json layers — what the operator sees)
// cropped to each stroke, with the stroke on top.
import { readFileSync, writeFileSync } from 'fs'

const SCENE = process.argv[2] || 'lafayette-square'
const DIR = `cartograph/data/${SCENE}/clean`
const map = JSON.parse(readFileSync(`${DIR}/map.json`, 'utf-8'))
const strokes = JSON.parse(readFileSync(`${DIR}/marker_strokes.json`, 'utf-8'))

const PAD = Number(process.env.PAD || 35)

const LAYERS = [
  ['park',    '#cfe6c7', 'none'],
  ['block',   '#e8e2d6', '#b9ae99'],
  ['lot',     'none',    '#d8cfc0'],
  ['pavement','#cdc9c2', '#9a938a'],
  ['sidewalk','#f2efe8', '#c2bbae'],
  ['alley',   '#dcd8d0', '#a9a297'],
]

function ringPts(r) {
  return (r || []).map(p => Array.isArray(p) ? `${p[0]},${p[1]}` : `${p.x},${p.z}`).join(' ')
}
function bboxOf(pts) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
  for (const p of pts) {
    const x = Array.isArray(p) ? p[0] : p.x, z = Array.isArray(p) ? p[1] : p.z
    if (x < a) a = x; if (x > b) b = x; if (z < c) c = z; if (z > d) d = z
  }
  return { minX: a, maxX: b, minZ: c, maxZ: d }
}
const hits = (bb, vb) => !(bb.maxX < vb.x || bb.minX > vb.x + vb.w || bb.maxZ < vb.z || bb.minZ > vb.z + vb.h)

strokes.forEach((stroke, i) => {
  const sb = bboxOf(stroke)
  const vb = { x: sb.minX - PAD, z: sb.minZ - PAD, w: (sb.maxX - sb.minX) + 2 * PAD, h: (sb.maxZ - sb.minZ) + 2 * PAD }
  const sw = (vb.w / 300).toFixed(2)
  let body = ''
  const counts = {}
  for (const [name, fill, stroke_] of LAYERS) {
    const feats = map.layers?.[name] || []
    let n = 0
    for (const f of feats) {
      const ring = f.ring || f
      if (!ring || ring.length < 3) continue
      if (!hits(bboxOf(ring), vb)) continue
      n++
      body += `<polygon points="${ringPts(ring)}" fill="${fill}" stroke="${stroke_}" stroke-width="${sw}" fill-opacity="0.9"/>\n`
      // holes, if the feature carries them
      for (const h of (f.holes || [])) body += `<polygon points="${ringPts(h)}" fill="#ff00ff" fill-opacity="0.35" stroke="#ff00ff" stroke-width="${sw}"/>\n`
    }
    counts[name] = n
  }
  body += `<polyline points="${ringPts(stroke)}" fill="none" stroke="#e00" stroke-width="${sw * 2.5}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>\n`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.z} ${vb.w} ${vb.h}" width="900" height="${Math.round(900 * vb.h / vb.w)}">
<rect x="${vb.x}" y="${vb.z}" width="${vb.w}" height="${vb.h}" fill="#faf8f3"/>
${body}</svg>`
  writeFileSync(`scratch/_mk-${i}.svg`, svg)
  console.log(`stroke ${i}  centre ${((sb.minX+sb.maxX)/2).toFixed(0)},${((sb.minZ+sb.maxZ)/2).toFixed(0)}  ` + Object.entries(counts).map(([k,v])=>`${k}:${v}`).join(' '))
})
