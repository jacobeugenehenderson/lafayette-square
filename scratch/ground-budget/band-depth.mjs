// band-depth.mjs — EVERY PAINTED BAND PIECE LIES WITHIN ITS BLOCK'S DEEPEST BAND OF ②? READ-ONLY (Tern, 2026-10-14; Boz).
// Over a dump of the deformer's own input (deform.json: shape tiles + the bands AS PAINTED), per band piece (curb · lawn · walk):
//   · each vertex is measured against the ② (`iaFull`) of the tile whose ① ring holds THAT vertex (a piece can span blocks:
//     the paint unions a town's curb into a few pieces), and the piece's reach is the max over its vertices;
//   · the block's deepest band: the curb width the bake paints with (bake-ground: the look's `curbWidth`, else streetProfiles'
//     `CURB_WIDTH`; both READ here, the town from the dump's meta.json) + the largest treelawn + sidewalk the painter
//     resolves on any of the tile's run sides (`resolvePedDepths`, imported, with the run's AUTHORED custom: the look's
//     `blockCustoms[skelId][side][segOrd]`, the painter's own `runCustom` key; ⛔ never measured without the authoring);
//   · the painter offsets its bands with Clipper's MITER join, so a corner may reach depth × its miterLimit: read from
//     tileGround's own `new ClipperOffset(<limit>, …)` (every one must agree), never restated;
//   · a piece reaching deeper than the deepest band × that limit, by more than the lattice, is NAMED: tile, the ② ring and vertex at its root (its
//     nearest point to ②), that vertex's run (skelId|side|segOrd off `iaStamp`) and arc (`iaArc`). ⛔ Owner by the polygon.
//   node --max-old-space-size=6000 scratch/ground-budget/band-depth.mjs <dump dir> [top N]
// The dump is deform.json + meta.json, as bake-ground's deformer receives them (Tern's probe 3 wrote one for Huron).
import { readFileSync } from 'fs'
const R = new URL('../../', import.meta.url).pathname
const { resolvePedDepths } = await import(R + 'src/lib/tileGround.js'), { CLIP_SCALE } = await import(R + 'src/lib/lattice.js')
const [dump, topN = 30] = process.argv.slice(2)
const { scene } = JSON.parse(readFileSync(dump + '/meta.json', 'utf8')); if (!scene) throw new Error('band-depth: the dump\'s meta.json names no scene')
const { readBakeDesign } = await import(R + 'cartograph/lookDesign.mjs'), { CURB_WIDTH } = await import(R + 'src/cartograph/streetProfiles.js')
const design = readBakeDesign(scene, scene, 'band-depth'), curbW = Number.isFinite(design.curbWidth) ? design.curbWidth : CURB_WIDTH
const curbFrom = Number.isFinite(design.curbWidth) ? `${scene}'s look (curbWidth)` : 'streetProfiles CURB_WIDTH (the look authors none)'
const D = JSON.parse(readFileSync(dump + '/deform.json', 'utf8')), LATTICE = 1 / CLIP_SCALE
const limits = [...readFileSync(R + 'src/lib/tileGround.js', 'utf8').matchAll(/new ClipperOffset\(\s*([0-9.]+)\s*,/g)].map(m => +m[1])
if (!limits.length || limits.some(l => l !== limits[0])) throw new Error(`band-depth: tileGround's ClipperOffset miter limits are ${limits.join(', ') || 'not found'} — one is expected`)
const MITER = limits[0]
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c }
const rings = (it) => it.outer ? [it.outer, ...(it.holes || [])] : [it]
// ② segments per tile, in a grid
const CELL = 16, T = []
D.tiles.forEach((t, ti) => { if (!t?.iaFull?.length || !(t.ring?.length >= 3)) return
  const grid = new Map(), segs = []
  t.iaFull.forEach((r, ri) => { for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], s = { a, b, ri, i }; segs.push(s)
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL), z0 = Math.floor(Math.min(a[1], b[1]) / CELL), z1 = Math.floor(Math.max(a[1], b[1]) / CELL)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; (grid.get(k) || grid.set(k, []).get(k)).push(s) } } })
  let deep = 0, deepAt = null
  for (const run of t.runs || []) { if (!run.baseMeasure) continue; const { tl, sw } = resolvePedDepths(run.baseMeasure, run.side, design.blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null); if (tl + sw > deep) { deep = tl + sw; deepAt = `${run.skelId}|${run.side}` } }
  T.push({ ti, t, grid, segs, deepest: curbW + deep, deepAt }) })
const near = (B, p) => { let best = null, cx = Math.floor(p[0] / CELL), cz = Math.floor(p[1] / CELL)
  for (let rad = 0; rad < 64 && (!best || best.d > (rad - 1) * CELL); rad++) for (let x = cx - rad; x <= cx + rad; x++) for (let z = cz - rad; z <= cz + rad; z++) {
    if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) !== rad) continue
    for (const s of B.grid.get(x * 100003 + z) || []) { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / L2)) : 0
      const d = Math.hypot(p[0] - s.a[0] - u * dx, p[1] - s.a[1] - u * dz); if (!best || d < best.d) best = { d, s, u } } } return best }
const out = [], stat = { pieces: 0, noTile: 0, within: 0, deeper: 0 }
for (const cls of ['curb', 'lawn', 'walk']) D.bands[cls].forEach((it, pi) => { stat.pieces++
  const V = rings(it)[0]; if (!V?.length) return
  let far = 0, farP = null, farB = null, held = 0
  for (const p of V) { const B = T.find(b => pip(p[0], p[1], b.t.ring)); if (!B) continue; held++
    const n = near(B, p); if (!n) continue; const over = n.d - B.deepest * MITER; if (!farB || over > far - farB.deepest * MITER) { far = n.d; farP = p; farB = B } }
  if (!held) { stat.noTile++; return }
  const B = farB
  if (far <= B.deepest * MITER + LATTICE) { stat.within++; return }
  // its root: the vertex of the piece nearest to B's ② (where the piece meets the street it hangs off)
  let root = null; for (const p of V) { const n = near(B, p); if (n && (!root || n.d < root.d)) root = n }
  stat.deeper++
  const vi = root.u < 0.5 ? root.s.i : (root.s.i + 1) % B.t.iaFull[root.s.ri].length, st = B.t.iaStamp?.[root.s.ri]?.[vi], run = st != null ? B.t.runs[st] : null
  out.push({ cls, pi, tile: B.ti, ring: root.s.ri, vertex: vi, run: run ? `${run.skelId}|${run.side}|${run.segOrd}` : (B.t.iaCap?.[root.s.ri]?.[vi] != null ? 'cap' : 'unstamped'), arc: B.t.iaArc?.[root.s.ri]?.[vi] ?? null,
    far: +far.toFixed(2), deepest: +B.deepest.toFixed(2), farAt: farP.map(v => +v.toFixed(2)), verts: V.length }) })
console.log(`${dump}: band pieces ${stat.pieces} · in no tile ${stat.noTile} · within their block's deepest band ${stat.within} · DEEPER ${stat.deeper} (curb ${curbW} m from ${curbFrom} + the deepest resolved treelawn + sidewalk, × the painter's miter limit ${MITER}; the lattice ${LATTICE} m)`)
const byTile = {}; for (const o of out) { const k = `tile ${o.tile}`; (byTile[k] ??= { pieces: 0, far: 0, cls: {}, runs: {} }); const b = byTile[k]; b.pieces++; b.far = Math.max(b.far, o.far); b.cls[o.cls] = (b.cls[o.cls] || 0) + 1; b.runs[o.run] = (b.runs[o.run] || 0) + 1 }
console.log('by tile (pieces deeper than the block\'s deepest band · the farthest reach · by class · at the run of their root):')
for (const [k, b] of Object.entries(byTile).sort((a, b) => b[1].pieces - a[1].pieces)) console.log(`  ${k}: ${b.pieces} · reach ${b.far} m · ${Object.entries(b.cls).map(([c, n]) => `${c} ${n}`).join(' ')} · ${Object.entries(b.runs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, n]) => `${r} ×${n}`).join(' · ')}`)
console.log(`the ${topN} farthest:`)
for (const o of out.sort((a, b) => b.far - a.far).slice(0, +topN)) console.log(`  ${o.cls} piece ${o.pi} (${o.verts} v): tile ${o.tile} ring ${o.ring} vertex ${o.vertex} · run ${o.run} · arc ${o.arc ?? '—'} · reaches ${o.far} m (deepest ${o.deepest}) at (${o.farAt.join(', ')})`)
