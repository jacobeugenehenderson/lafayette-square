// _chainEnds.mjs — THE CHAIN ENDS THAT ARE NO NODE, judged against the other streets' roadways. Read by two checks, one ruling
// each (BRIEF-a-chain-end-in-a-roadway-is-a-T §1): `claims-a-chain-end-in-a-roadway-is-a-node` (a: INSIDE, joined at mintInputs)
// and `claims-a-chain-end-reaching-a-roadway-awaits-a-ruling` (b′: its own roadway REACHES, not joined; Jacob's question).
//   · NODE: the skeleton's own reading, `skeleton.js#buildNodeGraph` over `vKey` (run from the source, never restated). An end
//     whose key has degree 1 is no node.
//   · THE OTHER STREET'S LINE: the line ① is minted from, the skeleton's points through `derive.js#tessellateAdaptive` with its
//     `segments` (the same call `mintInputs.mjs#mintInputs` makes).
//   · ITS HALF-WIDTH: the POUR's measure, `tileGround.js#resolveProtoMeasure(run, null, …)` on the ribbons' base measure, for
//     the SIDE of that street the end lies on. ⛔ The Wall: the pour is blind to authoring (`claims-proto-wall` claim A), so no
//     blockCustoms is read here. (The pour's base also goes through `effectiveMeasure`, which zeroes only an inboard side's
//     ped depths; pavementHW passes through it unchanged.)
//   · (a) inside: the end is within that half-width of the other street's line. (b′) reaching: not inside, but the end's own
//     roadway (its own half-width, the narrower side) reaches the other's.
//   · Set aside, counted and NAMED: an end outside the drawing (the disc, discOf), a chain with no ribbon, and a pair where
//     either chain is GRADE-SEPARATED (mintInputs mints those apart, and Boz ruled them out of the join, 2026-10-27; a nodeless
//     CROSSING is claims-a-nodeless-crossing-is-grade-separated's).
//   · A same-name pair is the false-dead-end class: labelled (claims-false-deadend-census asks by name). It still counts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importSource } from './_importSource.mjs'
import { ribbonsPathOf, mapCleanDir, mapDir } from '../cartograph/scene.js'
import { tessellateAdaptive } from '../cartograph/derive.js'
import { resolveProtoMeasure } from '../src/lib/tileGround.js'
import { splitBoundary, discOf } from '../cartograph/boundaryRecords.mjs'

const { vKey } = await importSource('cartograph/skeleton.js', { span: { from: 'function vKey(p)', to: 'function reverse(coords)' }, suffix: 'export { vKey }' })
const { buildNodeGraph } = await importSource('cartograph/skeleton.js', { span: { functions: ['buildNodeGraph'] }, prefix: `const vKey = ${vKey.toString()}`, suffix: 'export { buildNodeGraph }' })
export { vKey }
export const f2 = (v) => v.toFixed(2)

export function loadTown(scene) {
  const sk = JSON.parse(readFileSync(join(mapCleanDir(scene), 'skeleton.json'), 'utf8')).streets || []
  const rib = JSON.parse(readFileSync(ribbonsPathOf(scene), 'utf8')).streets || []
  const { disc: d0 } = splitBoundary(JSON.parse(readFileSync(join(mapDir(scene), 'neighborhood_boundary.json'), 'utf8')), `${scene}'s neighborhood_boundary.json`)
  return { sk, rib, disc: discOf(d0, scene) }
}

const hwOfIn = (R) => (id, side) => { const r = R.get(id); return r ? resolveProtoMeasure({ skelId: id, side, segOrd: null, baseMeasure: r.measure, hwy: false }, null, 0)?.pavementHW ?? null : null }
const atGrade = (R) => (c) => c.points?.length >= 2 && R.has(c.id) && !R.get(c.id).gradeSeparated

// the ends a skeleton holds that are no node, judged against every other ribbon chain's roadway
export function judge({ sk, rib, disc }) {
  const { degree } = buildNodeGraph(sk)
  const R = new Map(rib.map(r => [r.skelId, r])), hwOf = hwOfIn(R)
  const lines = sk.filter(c => c.points?.length >= 2 && R.has(c.id)).map(c => ({ c, pts: tessellateAdaptive(c.points.map(q => [q.x, q.z]), c.segments) }))
  const G = 50, grid = new Map()
  lines.forEach((L, li) => { for (let k = 0; k + 1 < L.pts.length; k++) { const a = L.pts[k], b = L.pts[k + 1]
    for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / G); z <= Math.floor(Math.max(a[1], b[1]) / G); z++) {
      const key = x + ',' + z; (grid.get(key) || grid.set(key, []).get(key)).push([li, k]) } } })
  const out = { ends: 0, inside: [], reach: [], noHW: new Set(), aside: { outsideDisc: 0, noRibbon: 0, gradeSep: [] } }
  for (const c of sk) { if (!(c.points?.length >= 2)) continue
    for (const ix of [0, c.points.length - 1]) { const p = c.points[ix]
      if (degree.get(vKey(p)) !== 1) continue
      out.ends++
      if (!R.has(c.id)) { out.aside.noRibbon++; continue }
      if (disc.dist(p.x, p.z) > disc.R) { out.aside.outsideDisc++; continue }
      const own = Math.min(hwOf(c.id, 'left') ?? Infinity, hwOf(c.id, 'right') ?? Infinity)
      if (!Number.isFinite(own)) out.noHW.add(c.id)
      let best = null
      for (let x = Math.floor((p.x - 60) / G); x <= Math.floor((p.x + 60) / G); x++) for (let z = Math.floor((p.z - 60) / G); z <= Math.floor((p.z + 60) / G); z++) for (const [li, k] of grid.get(x + ',' + z) || []) {
        const L = lines[li]; if (L.c.id === c.id) continue
        const a = L.pts[k], b = L.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) continue
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)), d = Math.hypot(p.x - a[0] - t * dx, p.z - a[1] - t * dz)
        const side = dx * (p.z - a[1]) - dz * (p.x - a[0]) > 0 ? 'left' : 'right'
        const hw = hwOf(L.c.id, side); if (!Number.isFinite(hw)) { out.noHW.add(L.c.id); continue }
        if (!best || d - hw < best.d - best.hw) best = { d, hw, side, into: L.c } }
      if (!best) continue
      const row = { id: c.id, name: c.name, into: best.into.id, intoName: best.into.name, d: best.d, hw: best.hw, side: best.side, own, p, sameName: !!c.name && c.name === best.into.name, gs: [R.get(c.id).gradeSeparated && c.id, R.get(best.into.id).gradeSeparated && best.into.id].filter(Boolean) }
      const kind = best.d <= best.hw ? '(a)' : Number.isFinite(own) && best.d - best.hw <= own ? '(b′)' : null
      if (!kind) continue
      if (row.gs.length) out.aside.gradeSep.push({ ...row, kind })
      else (kind === '(a)' ? out.inside : out.reach).push(row) } }
  return out
}

export function printRow(r, tag) {
  console.log(`   ${tag} ${r.id} (${r.name || 'unnamed'}) → ${r.into} (${r.intoName || 'unnamed'}): ${f2(r.d)} m from its line, its ${r.side} half-width ${f2(r.hw)} m${tag.includes('(b′)') ? `, own ${f2(r.own)} m` : ''} @(${r.p.x.toFixed(1)}, ${r.p.z.toFixed(1)})${r.sameName ? ' · SAME NAME: the false-dead-end class, a question (claims-false-deadend-census)' : ''}${r.gs?.length ? ` · grade-separated: ${r.gs.join(', ')}` : ''}`)
}

// every T whose end sits on an interior vertex of an at-grade through chain (a straight segment after it), inside the drawing
function* eachT({ sk, rib, disc }, keep) {
  const R = new Map(rib.map(r => [r.skelId, r])), ok = atGrade(R)
  const interior = new Map()
  for (const c of sk) if (ok(c)) c.points.forEach((q, i) => { if (i > 0 && i + 1 < c.points.length) interior.set(vKey(q), { c, i }) })
  for (const c of sk) { if (!ok(c)) continue
    for (const ix of [0, c.points.length - 1]) { const p = c.points[ix], th = interior.get(vKey(p))
      if (!th || th.c === c || disc.dist(p.x, p.z) > disc.R - 10 || th.c.segments?.[th.i]?.type === 'bezier') continue
      const hit = keep({ c, ix, p, th, R }); if (hit) yield hit } }
}
const first = (it) => { for (const x of it) return x; return null }

// mutant (a): a noded T end moved 0.5 m along the through street, off its vertex and still on its line
export function moveTEnd(town) {
  return first(eachT(town, ({ c, ix, p, th }) => {
    const n = th.c.points[th.i + 1], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz); if (l < 2) return null
    const moved = { x: p.x + 0.5 * dx / l, z: p.z + 0.5 * dz / l }
    return { sk: town.sk.map(x => x === c ? { ...c, points: c.points.map((q, i) => i === ix ? moved : q) } : x), what: `${c.id}'s end on ${th.c.id}` } }))
}

// mutant (b′): a noded T end pulled back along its own (straight, near-perpendicular) last leg to just past the through
// street's roadway, by half its own half-width, so its own roadway still reaches the other's. A T crowded by a third street (the
// pulled end lands inside it) is not the case being made, so candidates are tried in order until the pulled end is judged against
// its own through street; the first is returned with its judgement. ⛔ None qualifying is reported as a mutant not made, never a pass.
export function pullBackTEnd(town) {
  const hwOf = hwOfIn(new Map(town.rib.map(r => [r.skelId, r])))
  for (const M of eachT(town, ({ c, ix, p, th }) => {
    const back = c.points[ix === 0 ? 1 : ix - 1], seg = c.segments?.[ix === 0 ? 0 : ix - 1]
    if (seg?.type === 'bezier') return null
    const n = th.c.points[th.i + 1], tx = n.x - p.x, tz = n.z - p.z, tl = Math.hypot(tx, tz)
    const ux = back.x - p.x, uz = back.z - p.z, ul = Math.hypot(ux, uz); if (tl < 2 || !ul) return null
    const sin = Math.abs(tx * uz - tz * ux) / (tl * ul); if (sin < 0.9) return null           // within ~25° of perpendicular
    const side = tx * uz - tz * ux > 0 ? 'left' : 'right', hw = hwOf(th.c.id, side)
    const own = Math.min(hwOf(c.id, 'left') ?? Infinity, hwOf(c.id, 'right') ?? Infinity)
    if (!Number.isFinite(hw) || !Number.isFinite(own)) return null
    const s = (hw + own / 2) / sin; if (s >= ul - 1) return null
    const moved = { x: p.x + s * ux / ul, z: p.z + s * uz / ul }
    return { sk: town.sk.map(x => x === c ? { ...c, points: c.points.map((q, i) => i === ix ? moved : q) } : x), what: `${c.id}'s end pulled ${f2(s)} m back from ${th.c.id}`, id: c.id, into: th.c.id } })) {
    const J = judge({ ...town, sk: M.sk })
    if ([...J.inside, ...J.reach].some(r => r.id === M.id && r.into === M.into)) return { ...M, J }
  }
  return null
}
