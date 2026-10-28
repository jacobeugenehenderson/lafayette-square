// PLANT (Zob, 2026-10-27; filed by Ferrule, BACKLOG census row): an inland pond: one water ring wholly on land (positive, depth 0), its arc the ring closed on its own first point. Refuses at absorbInk ("1 touch none"), identically on integration e282eb9d and ferrule 02520a5a/2eaf3b85. Cause not established.
const tg = await import('../../src/lib/tileGround.js')
const sa = (q) => q.reduce((t, p, i) => { const s = q[(i + 1) % q.length]; return t + p[0] * s[1] - s[0] * p[1] }, 0) / 2
const side = { pavementHW: 5, treelawn: 1.5, sidewalk: 1.5, terminal: 'sidewalk', parking: 2.4 }
const st = (id, pts, d0 = 2, d1 = 2) => ({ skelId: id, roadId: id, throughId: id, name: id, points: pts, highway: 'residential', class: 'local', lanes: 2, oneway: false,
  measure: { left: { ...side }, right: { ...side }, symmetric: true, source: 'seed' }, seed: { cornerR: 4.5, pavementHW: 5 },
  marks: { centre: { kind: 'none' }, edges: { kind: null } }, caps: { start: { cap: d0 === 1 ? 'round' : null, degree: d0 }, end: { cap: d1 === 1 ? 'round' : null, degree: d1 } } })
const B = 300, water = [[-B, 0], [B, 0], [B, B], [-B, B]]
const sq = [[60, -100], [140, -100], [140, -160], [60, -160]], base = sq.map((a, i) => st('s' + i, [a, sq[(i + 1) % 4]]))
const disc = Array.from({ length: 64 }, (_, i) => [280 * Math.cos(i / 32 * Math.PI), 280 * Math.sin(i / 32 * Math.PI)])
const N = 10, isl = Array.from({ length: N }, (_, i) => [+(70 * Math.cos(i / N * 2 * Math.PI + 0.13)).toFixed(3), +(150 + 70 * Math.sin(i / N * 2 * Math.PI + 0.13)).toFixed(3)])
const run = (label, seat, nodeAt) => { let hole = [...isl.slice(seat), ...isl.slice(0, seat)]; if (sa(hole) > 0) hole.reverse()
  const l = console.log, w = console.warn; let why = null, MP = null; console.log = () => {}; console.warn = () => {}
  try { MP = tg.mintProtopolygon({ streets, bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [water, hole], coastArcs: [[[B, 0], [-B, 0]], [...hole, hole[0]]] }) } catch (e) { why = e.message } finally { console.log = l; console.warn = w }
  console.log(`${label}: ${why ? 'REFUSED: ' + why.slice(0, 220) : `minted, ${MP.blocks?.length ?? '?'} blocks`}`) }
// a pond: water is a ring wholly on land, its arc closed
const pond = isl.map(([x, z]) => [x - 150, z - 300]); const P = sa(pond) > 0 ? pond : pond.slice().reverse()
for (const seat of [0, 4]) { const r = [...P.slice(seat), ...P.slice(0, seat)], l = console.log, w = console.warn; let why = null; console.log = () => {}; console.warn = () => {}
  try { tg.mintProtopolygon({ streets: base, bb: { x0: -B, x1: B, z0: -B, z1: B }, boundary: disc, coast: [r], coastArcs: [[...r, r[0]]] }) } catch (e) { why = e.message } finally { console.log = l; console.warn = w }
  console.log(`pond seat ${seat}: ${why ? 'REFUSED: ' + why.slice(0, 220) : 'minted'}`) }
