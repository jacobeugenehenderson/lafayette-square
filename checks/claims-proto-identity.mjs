// ▶ node checks/claims-proto-identity.mjs [town ...]   (no town ⇒ every town with ribbons)
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
let bad = 0
for (const scene of feedScenes()) {   // no town named ⇒ every town with ribbons (checks/_scenes.mjs)
  const f = feed(scene); if (!f) { bad++; continue }
  const r = buildProto(f, { quiet: false })
  console.log(`${scene} proto rings:`, r.proto?.length)
  console.log('refused    :', r.protoRefused === null ? '✅ none — identity carried' : '⛔ ' + r.protoRefused)
  if (r.protoLabels) {
    const L = r.protoLabels
    console.log('labelled rings:', L.length)
    let edges = 0, owners = new Set()
    for (const ring of L) { edges += ring.length; for (const v of ring) owners.add(v) }
    console.log('labelled edges:', edges, '| distinct owning chains:', owners.size)
    const sizes = L.map(x => x.length).sort((a, b) => a - b)
    console.log('ring sizes: min', sizes[0], 'median', sizes[Math.floor(sizes.length / 2)], 'max', sizes.at(-1))
  }
}
process.exit(bad ? 1 : 0)
