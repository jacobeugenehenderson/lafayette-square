// Micro-segment audit for ribbons.json — counts short segments and
// classifies whether each is junction-clustered (an endpoint is an
// intersection-recorded vertex). Usage: node scratch/microseg-audit.mjs [path]
import fs from 'fs'

const path = process.argv[2] || 'src/data/ribbons.json'
const data = JSON.parse(fs.readFileSync(path, 'utf8'))
const streets = data.streets || data

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

let segLt2 = 0, segLt05 = 0
let segLt2Ix = 0, segLt05Ix = 0
const examples = []

for (const st of streets) {
  const pts = st.points
  if (!pts || pts.length < 2) continue
  // set of intersection vertex indices on this chain
  const ixIdx = new Set((st.intersections || []).map(x => x.ix))
  for (let i = 0; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[i + 1])
    if (d < 2.0) {
      segLt2++
      const atIx = ixIdx.has(i) || ixIdx.has(i + 1)
      if (atIx) segLt2Ix++
      if (d < 0.5) {
        segLt05++
        if (atIx) segLt05Ix++
      }
      if (examples.length < 25) {
        examples.push({ name: st.name, skelId: st.skelId, i, len: +d.toFixed(3), atIx })
      }
    }
  }
}

console.log(`File: ${path}`)
console.log(`Streets: ${streets.length}`)
console.log(`Segments < 2.0m : ${segLt2}  (junction-clustered: ${segLt2Ix}, ${segLt2 ? Math.round(100 * segLt2Ix / segLt2) : 0}%)`)
console.log(`Segments < 0.5m : ${segLt05}  (junction-clustered: ${segLt05Ix})`)
console.log('Examples:')
for (const e of examples) console.log('  ', JSON.stringify(e))
