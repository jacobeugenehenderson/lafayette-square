// label-fix-blocks.mjs — per block: walk pieces (claims-sidewalk-is-one-band's own test) · per ① turning vertex: the every-turn verdict. Keyed by ① ring.
// READ-ONLY (Tern, 2026-10-14; Boz). One proto pour of <scene>; writes { blocks, turns } keyed by the ① ring (which the label fix
// does not touch), never by tile index. Run it on HEAD and on the fix and diff the two (label-fix-trade-2026-10-14.md).
//   node --max-old-space-size=8000 scratch/ground-budget/label-fix-blocks.mjs <scene> <out.json>
import { writeFileSync, readFileSync } from 'fs'
const W = new URL('../../', import.meta.url).pathname
const { feed, buildProto } = await import(W + 'scratch/_proto-feed.mjs')
const { sectionPassProtoTile, tilePieceLus } = await import(W + 'src/lib/tileGround.js')
const { differenceRings } = await import(W + 'src/lib/buildBlockGeometryV2.js')
const [scene, out] = process.argv.slice(2)
const TOL = Number(readFileSync(W + 'src/lib/tileGround.js', 'utf8').match(/const FILLET_TURN_TOL\s*=\s*([0-9.]+)\s*\*\s*Math\.PI\s*\/\s*180/)[1])
const SA = r => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return a / 2 }
const ang = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(...u), lv = Math.hypot(...v); if (lu < 1e-9 || lv < 1e-9) return null; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))) * 180 / Math.PI }
const f = feed(scene), prev = console.log; console.log = () => {}
const T = buildProto(f, { quiet: true, protoArtifact: true }).protoShapeTiles; console.log = prev
const key = (r) => r.map(p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`).join(';')
const blocks = {}, turns = {}
for (const [ti, t] of T.entries()) {
  const k = key(t.ring)
  const r = sectionPassProtoTile(t, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
  const n = differenceRings(r.Wacc, []).filter(g => SA(g) > 0).length
  const owners = {}; for (const run of t.runs || []) owners[`${run.skelId}|${run.side}`] = 1
  blocks[k] = { ti, walk: n, lu: [...new Set(tilePieceLus(t).filter(Boolean))].join('+'), owners: Object.keys(owners), at: t.ring[0] }
  if (!t.iaFull?.length || !t.iaArc?.length || !t.iaStamp?.length) continue
  const eased = new Map(); t.iaStamp.forEach((S, ri) => (S || []).forEach((i, j) => { if (i == null) return; eased.set(i, (eased.get(i) || false) || (t.iaArc[ri]?.[j] != null)) }))
  const ring = t.ring, m = ring.length
  for (let i = 0; i < m; i++) { const a = ang(ring[(i - 1 + m) % m], ring[i], ring[(i + 1) % m]); if (a === null || a <= TOL) continue
    let v = 'made'; if (!eased.get(i)) { let d = Infinity, nearArc = null
      t.iaFull.forEach((Rg, ri) => Rg.forEach((p, j) => { const dd = Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]); if (dd < d) { d = dd; nearArc = t.iaArc[ri]?.[j] } }))
      v = (!eased.has(i) && nearArc != null) ? 'stampLost' : d > 20 ? 'absent' : 'dropped' }
    turns[`${k}|${i}`] = { ti, i, turn: +a.toFixed(1), at: ring[i], v } } }
writeFileSync(out, JSON.stringify({ blocks, turns }))
console.log(scene, 'blocks', Object.keys(blocks).length, 'turns', Object.keys(turns).length)
