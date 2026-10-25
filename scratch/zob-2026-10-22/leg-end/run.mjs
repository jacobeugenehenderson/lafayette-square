import { join } from 'path'
const [W, S] = process.argv.slice(2); process.chdir(W)
const { feed, buildProto } = await import(join(W, 'scratch/_proto-feed.mjs'))
const R = buildProto(feed(S), { quiet: true })
const G = globalThis.__legEnd || {}
console.error(`${S} (${W.split('/').pop()}): off-arc frontage changes ${G.n} · SAME ladder ${G.same} (of which iaCorner ${G.sameCorner}) · ladders differ ${G.diff} (of which iaCorner ${G.diffCorner}) · first same, not corner: ${JSON.stringify(G.at)}`)
let c = 0, cNoArc = 0, arcV = 0, turnNoMark = 0
for (const t of R.protoShapeTiles || []) (t.iaFull || []).forEach((ring, si) => ring.forEach((b, v) => {
  const isC = !!t.iaCorner?.[si]?.[v], arc = t.iaArc?.[si]?.[v] != null; if (isC) { c++; if (!arc) cNoArc++ } if (arc) arcV++
  const a = ring[(v - 1 + ring.length) % ring.length], d = ring[(v + 1) % ring.length], tt = Math.abs((((Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI) + 540) % 360 - 180)
  if (tt > 60 && !isC && !arc) turnNoMark++ }))
console.error(`   ${S}: iaCorner true ${c} (without an arc ${cNoArc}) · vertices on an arc ${arcV} · vertices turning >60° with neither mark ${turnNoMark}`)
process.exit(0)
