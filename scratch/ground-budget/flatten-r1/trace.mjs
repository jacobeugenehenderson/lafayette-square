// trace.mjs — WHERE does one line become two? (Boz, 2026-10-14). Store for the hooks make-trace.mjs plants in scratch
// copies of tileGround.js and bake-ground.js, and the analysis run at the stack entry:
//   S0 the depth lines (pedOuter, luIn, walkFrom, walkTo) · S1 the band booleans (curb, sidewalk = Wp, treelawn = env − Wp,
//   lu = luIn) · S2 ∩ iA (`inBlock`) · S3 `rekeyByPiece` (treelawn, lu per land use) · S4 the cross-tile union, then the
//   stencil clip · STACK what the flatten receives.
// For ~5 two-lines near-miss examples per top producer pair (the check's own `nearMisses`, sliced from its source), each
// stage's rings of the two sides near the example are compared: the FIRST stage at which they near-miss there is where
// the line became two. At S0 the question is whether two DIFFERENT depth lines run along it ("depth line drawn twice")
// or one ("one line, two boolean chains").
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { CLIP_SCALE, LATTICE_M } from '../../../src/lib/lattice.js'
const T = { tiles: [], rekey: [], s4: {} }
export function trTile(st, f) { const s = f(); s.bbox = bboxOf([...(st.iA || [])]); T.tiles.push(s) }
export function trRekey(st, layer, byLu) { for (const [lu, rings] of Object.entries(byLu)) T.rekey.push({ layer, lu, rings, bbox: bboxOf(rings) }); return byLu }
export function trS4(k, stages) { T.s4[k] = stages }
const bboxOf = (rings) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const r of rings || []) for (const [x, z] of r || []) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z } return [x0, z0, x1, z1] }
const src = readFileSync(fileURLToPath(new URL('../../../checks/claims-no-edge-is-drawn-twice.mjs', import.meta.url)), 'utf8')
const i = src.indexOf('export function nearMisses(entries) {'), j = src.indexOf('function report(town, pairs, expect) {')
// the cell size: the check's median edge length overflows a Map (2^24 cells) on S1's unclipped whole-town rings, so the
// trace indexes at the 98th percentile — indexing only, the definition is the check's
const body = src.slice(i, j).replace('export function', 'function'), med = 'Float64Array.from(lens).sort()[m >> 1]'
if (!body.includes(med)) throw new Error('trace: the check\'s cell-size expression moved')
const nearMisses = new Function('CLIP_SCALE', 'LATTICE_M', 'STEP', body.replace(med, 'Float64Array.from(lens).sort()[Math.floor(m * 0.98)]') + '\nreturn nearMisses')(CLIP_SCALE, LATTICE_M, CLIP_SCALE * LATTICE_M)

const near = (rings, box) => (rings || []).filter(r => { const b = bboxOf([r]); return b[0] <= box[2] && box[0] <= b[2] && b[1] <= box[3] && box[1] <= b[3] })
const tileRings = (stage, layer, box) => T.tiles.filter(t => t.bbox[0] <= box[2] && box[0] <= t.bbox[2] && t.bbox[1] <= box[3] && box[1] <= t.bbox[3]).flatMap(t => near(t[stage]?.[layer], box))
const lyr = (g) => g === 'mat:sidewalk' ? ['sidewalk', null] : g === 'mat:curb' ? ['curb', null] : g.startsWith('mat:treelawn:') ? ['treelawn', g.slice(13)] : g.startsWith('face:') ? ['lu', g.slice(5)] : [null, null]
function ringsAt(stage, g, box, entries) {
  const [l, lu] = lyr(g); if (!l) return null
  if (stage === 'S1' || stage === 'S2') return tileRings(stage, l, box)
  if (stage === 'S3') return lu ? T.rekey.filter(x => x.layer === l && x.lu === lu).flatMap(x => near(x.rings, box)) : tileRings('S2', l, box)
  const k = l === 'treelawn' ? 'tl:' + lu : l === 'lu' ? 'lu:' + lu : l
  if (stage === 'S4pre' || stage === 'S4union' || stage === 'S4clip') return near(T.s4[k]?.[{ S4pre: 'pre', S4union: 'union', S4clip: 'clip' }[stage]], box)
  if (stage === 'STACK') return near(entries.find(e => e.groupKey === g)?.items.flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])]), box)
}
const STAGES = ['S1', 'S2', 'S3', 'S4pre', 'S4union', 'S4clip', 'STACK']
export function analyse(entries, pairsWanted, out) {
  const all = nearMisses(entries.filter(e => pairsWanted.some(p => p.includes(e.groupKey))))
  const res = { examples: [], firstStage: {}, s0: {} }
  for (const pw of pairsWanted) {
    const xs = all.filter(p => p.shape === 'two-lines' && [p.ga, p.gb].sort().join(' / ') === [...pw].sort().join(' / ')).sort((a, b) => b.m - a.m)
    const picked = []; for (const p of xs) { if (picked.every(q => Math.hypot(q.at[0] - p.at[0], q.at[1] - p.at[1]) > 20)) picked.push(p); if (picked.length === 5) break }
    for (const p of picked) {
      const pad = 2, box = [Math.min(p.seg[0][0], p.seg[1][0]) - pad, Math.min(p.seg[0][1], p.seg[1][1]) - pad, Math.max(p.seg[0][0], p.seg[1][0]) + pad, Math.max(p.seg[0][1], p.seg[1][1]) + pad]
      const mid = p.at, hit = (pairs) => pairs.some(q => { const [[ax, az], [bx, bz]] = q.seg, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((mid[0] - ax) * dx + (mid[1] - az) * dz) / L2)) : 0
        return Math.hypot(mid[0] - ax - t * dx, mid[1] - az - t * dz) <= 2 * LATTICE_M })
      const stage = {}
      for (const s of STAGES) { const A = ringsAt(s, p.ga, box, entries), B = ringsAt(s, p.gb, box, entries)
        if (!A?.length || !B?.length) { stage[s] = 'absent'; continue }
        const nm = nearMisses([{ groupKey: 'A', items: A }, { groupKey: 'B', items: B }])
        stage[s] = hit(nm) ? 'TWO' : 'one' }
      // S0: which depth lines run along the example (both its ends within a step), and do they near-miss each other there
      const lines = ['pedOuter', 'luIn', 'walkFrom', 'walkTo'].map(k => [k, tileRings('S0', k, box)])
      const sd = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2)) : 0; return Math.hypot(px - a[0] - t * dx, pz - a[1] - t * dz) }
      const on = (rings) => [p.seg[0], p.seg[1], mid].every(([x, z]) => rings.some(r => r.some((a, k) => sd(x, z, a, r[(k + 1) % r.length]) <= LATTICE_M)))
      const along = lines.filter(([, rs]) => on(rs)).map(([k]) => k)
      const along2 = lines.filter(([k]) => along.includes(k))
      let s0 = along.length === 0 ? 'no-depth-line' : along.length === 1 ? 'one-depth-line' : 'several-depth-lines'
      if (along.length >= 2) { const nm = nearMisses(along2.map(([k, rs]) => ({ groupKey: k, items: rs }))); s0 = hit(nm) ? 'depth-line-drawn-twice' : 'several-lines-one-integer-line' }
      const first = STAGES.find(s => stage[s] === 'TWO') || 'never'
      const verdict = s0 === 'depth-line-drawn-twice' ? 'depth line drawn twice' : 'one line, two boolean chains'
      res.examples.push({ pair: pw.join(' / '), at: mid, m: +p.m.toFixed(3), a: p.a, b: p.b, s0, along, stage, first, verdict })
      res.firstStage[first] = (res.firstStage[first] || 0) + 1; res.s0[verdict] = (res.s0[verdict] || 0) + 1
    }
  }
  writeFileSync(out, JSON.stringify(res, null, 1)); return res
}

// THE WHOLE TOWN, by stage: near-miss metres between LAYERS (curb · sidewalk · treelawn · lu — land uses merged, so a
// pair is cross-layer at every stage alike), over every tile's rings at S1, S2, S3 and the cross-tile S4clip, then the
// stack. The stage where the metres jump is where the town's lines become two.
export function wholeTown(entries) {
  const layers = ['curb', 'sidewalk', 'treelawn', 'lu'], out = {}
  const cross = (pairs) => pairs.filter(p => p.ga !== p.gb).reduce((t, p) => t + p.m, 0)
  for (const s of ['S1', 'S2']) out[s] = cross(nearMisses(layers.map(l => ({ groupKey: l, items: T.tiles.flatMap(t => t[s]?.[l] || []) }))))
  out.S3 = cross(nearMisses(layers.map(l => ({ groupKey: l, items: (l === 'treelawn' || l === 'lu') ? T.rekey.filter(x => x.layer === l).flatMap(x => x.rings) : T.tiles.flatMap(t => t.S2?.[l] || []) }))))
  const s4 = (l) => Object.entries(T.s4).filter(([k]) => l === 'treelawn' ? k.startsWith('tl:') : l === 'lu' ? k.startsWith('lu:') : k === l).flatMap(([, v]) => v.clip || [])
  out.S4clip = cross(nearMisses(layers.map(l => ({ groupKey: l, items: s4(l) }))))
  const toL = (g) => lyr(g)[0]
  out.STACK = cross(nearMisses(layers.map(l => ({ groupKey: l, items: entries.filter(e => toL(e.groupKey) === l).flatMap(e => e.items.flatMap(it => Array.isArray(it) ? [it] : [it.outer, ...(it.holes || [])])) }))))
  for (const k of Object.keys(out)) out[k] = +out[k].toFixed(1)
  return out
}

// ONE EXAMPLE, in full (TRACE_AT="x,z"): rekeyByPiece's input band, every part's evidence region and class, and its
// output, for each call whose band comes within 1 m of the point — written to TRACE_AT_OUT.
const AT = (process.env.TRACE_AT || '').split(',').map(Number)
const atRec = []
export function trRekeyFull(st, own, parts, classes, ev) {
  if (AT.length !== 2 || !own?.length) return
  const b = bboxOf(own); if (!(AT[0] >= b[0] - 1 && AT[0] <= b[2] + 1 && AT[1] >= b[1] - 1 && AT[1] <= b[3] + 1)) return
  atRec.push({ tileKey: st.key ?? null, hasEvidence: !!ev, own, parts: parts.map(p => ({ lu: p.lu, region: p.region })), classes })
}
export function trAtWrite() { if (process.env.TRACE_AT_OUT) writeFileSync(process.env.TRACE_AT_OUT, JSON.stringify({ at: AT, rekey: atRec, tiles: T.tiles.filter(t => AT[0] >= t.bbox[0] - 1 && AT[0] <= t.bbox[2] + 1 && AT[1] >= t.bbox[1] - 1 && AT[1] <= t.bbox[3] + 1).map(t => ({ S2: t.S2, S0: t.S0 })) })) }
