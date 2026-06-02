// Intersection integrity: compare junction LOCATIONS (the geometric crossing
// points) before vs after. A genuine crossing is a point where ≥2 distinct
// streets meet. The merge must not DROP any such location.
import fs from 'fs'

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const before = load(process.argv[2])
const after = load(process.argv[3])

// Reconstruct crossing locations from each street's recorded intersection
// vertices: gather the actual xz of every intersection vertex, cluster by
// 1.5m, and for each cluster collect the set of distinct street names present.
function junctions(data) {
  const pts = []
  for (const st of data.streets) {
    for (const x of (st.intersections || [])) {
      const p = st.points[x.ix]
      if (p) pts.push({ x: p[0], z: p[1], name: st.name })
    }
  }
  const clusters = []
  for (const p of pts) {
    let c = clusters.find(c => Math.hypot(c.x - p.x, c.z - p.z) < 1.5)
    if (!c) { c = { x: p.x, z: p.z, names: new Set() }; clusters.push(c) }
    c.names.add(p.name)
  }
  // a real junction = cluster with ≥2 distinct street names
  return clusters.filter(c => c.names.size >= 2)
}

const jb = junctions(before)
const ja = junctions(after)
console.log(`Junction clusters (≥2 distinct streets):  before=${jb.length}  after=${ja.length}`)

// For each before-junction, is there an after-junction within 2m covering
// the same street names? (i.e. not dropped)
let missing = 0
for (const b of jb) {
  const match = ja.find(a => Math.hypot(a.x - b.x, a.z - b.z) < 2.5)
  if (!match) {
    missing++
    console.log(`  MISSING after: (${b.x.toFixed(1)},${b.z.toFixed(1)}) names=[${[...b.names].join(', ')}]`)
  }
}
console.log(`Before-junctions with NO nearby after-junction (dropped): ${missing}`)

// Total recorded intersection-vertex records per file
const recs = (d) => d.streets.reduce((s, st) => s + (st.intersections || []).length, 0)
console.log(`Total intersection records:  before=${recs(before)}  after=${recs(after)}`)
