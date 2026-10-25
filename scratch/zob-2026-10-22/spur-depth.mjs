// PTown's spur: the band depths either side of the stable-path-0 → stable-path-1 handoff, and any depth-step face there.
import { join } from 'path'
const [W, S] = process.argv.slice(2); process.chdir(W)
const { feed, buildProto } = await import(join(W, 'scratch/_proto-feed.mjs'))
const R = buildProto(feed(S), { quiet: true, bandPieces: true })
const P = [-314.154, -984.651], H = [-313.861, -984.461]
const near = (pt, r) => Math.hypot(pt[0] - P[0], pt[1] - P[1]) < r
const BP = R.bandPieces || R.protoBandPieces
console.log('result keys with band:', Object.keys(R).filter(k => /band/i.test(k)).join(','), '· BP', Array.isArray(BP) ? BP.length : typeof BP)
const T = (BP || []).find(t => t.tile === 1) || (BP || [])[1]
if (!T) { console.log('no band pieces for tile 1'); process.exit(0) }
console.log('tile-1 band keys', Object.keys(T).join(','))
const ed = T.edgeDepths
console.log('edgeDepths type', Array.isArray(ed) ? `array ${ed.length}` : typeof ed, JSON.stringify(Array.isArray(ed) ? ed.slice(0, 2) : Object.entries(ed || {}).slice(0, 2)).slice(0, 400))
const S2 = JSON.stringify
// edge depths whose geometry touches the handoff
const hits = (Array.isArray(ed) ? ed : Object.values(ed || {})).filter(e => { const s = S2(e); const nums = s.match(/-?\d+\.\d+/g)?.map(Number) || []; for (let i = 0; i + 1 < nums.length; i++) if (Math.hypot(nums[i] - P[0], nums[i + 1] - P[1]) < 2.5) return true; return false })
console.log(`edgeDepths within 2.5 m: ${hits.length}`); hits.slice(0, 12).forEach(h => console.log('  ', S2(h).slice(0, 400)))
const perp = (T.perp || []).filter(x => (x.faces || []).some(f => f.some(p => near(p, 3))) || (x.rings || []).some(r => r.some(p => near(p, 3))))
console.log(`perp (step faces) within 3 m: ${perp.length}`); perp.slice(0, 8).forEach(x => console.log('  ', S2({ cls: x.cls, kind: x.kind, si: x.si, i: x.i, atEnd: x.atEnd, corner: x.corner, spans: x.spans, faces: x.faces?.map(f => f.length) }).slice(0, 400)))
const pcs = (T.pieces || []).filter(q => (q.rings || []).some(r => r.some(p => near(p, 0.5))))
console.log(`pieces with a vertex within 0.5 m: ${pcs.length}`); pcs.slice(0, 10).forEach(q => console.log('  ', S2(Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'rings'))).slice(0, 300)))
const shape = (R.protoShapeTiles || [])[1], full = shape?.iaFull?.[0]
const own = (T.pieces || []).filter(q => q.cls === 'walk' || q.cls === 'lawn').flatMap(q => q.owners).filter(o => /^stable-path-[01]$/.test(o.skelId))
const es = [...new Set(own.flatMap(o => o.edges.filter(e => e.si === 0).map(e => e.e)))].sort((a, b) => a - b)
console.log('owner edges', own.map(o => `${o.skelId}|${o.side}|${o.segOrd} ${o.span}: ${o.edges.map(e => e.e).join(',')}`).join(' ; '))
for (let e = Math.min(...es) - 1; e <= Math.max(...es) + 1; e++) { const A = full?.[e], B = full?.[(e + 1) % full.length]
  console.log(`  iaFull[0][${e}] ${S2(A)}→${S2(B)} stamp ${S2(shape.iaStamp?.[0]?.[e])} · depths ${S2(T.edgeDepths?.[0]?.[e])}`) }
for (const v of [3599, 3613, 3622, 3619, 3620, 3621]) { const a = full[(v - 1 + full.length) % full.length], b = full[v], c = full[(v + 1) % full.length]
  const t = (Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI, turn = ((t + 540) % 360) - 180
  console.log(`  vertex ${v} ${S2(b)}: turn ${turn.toFixed(1)}° · iaCorner ${S2(shape.iaCorner?.[0]?.[v])} · iaJunction ${S2(shape.iaJunction?.[0]?.[v])} · iaArc ${S2(shape.iaArc?.[0]?.[v])} · iaCap ${S2(shape.iaCap?.[0]?.[v])} · stamp ${S2(shape.iaStamp?.[0]?.[v])}`) }
const seams = (T.seams || []).filter(x => S2(x).includes('stable-path')); console.log('seams', seams.length); seams.slice(0, 6).forEach(x => console.log('  ', S2(x).slice(0, 300)))
process.exit(0)
