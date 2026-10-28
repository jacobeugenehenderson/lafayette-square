// ⭐ A CHAIN END IN ANOTHER STREET'S ROADWAY IS A T (Jacob, 2026-10-27; registry `r-a-chain-end-in-a-roadway-is-a-T`,
// docs/briefs/BRIEF-a-chain-end-in-a-roadway-is-a-T.md). Joined by rule at ①'s input (`mintInputs.mjs#mintInputs`), judged by
// THAT street's own half-width. Pure: `joinChainEnds` takes the mint's streets and returns new ones plus the record; mintInputs
// calls it, and `checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs` calls the same function.
//   · AN END THAT IS NO NODE: its point, on the mint's lattice (CLIP_SCALE, the grid ①'s union snaps to), is held by no other
//     vertex of any chain the mint strokes (at grade or not). A self-loop's two ends hold each other, so it is a node.
//   · INSIDE: of every other chain the mint strokes, the one whose roadway the end is deepest in (distance from its tessellated
//     line minus its half-width on the side the end lies). That half-width is the POUR's: `resolveProtoMeasure(run, null, …)`
//     on the ribbon's base measure. ⛔ The Wall: authoring never sizes a join (`claims-proto-wall` claim A).
//   · NOT JOINED, each recorded by name with its reason (`aside` / `refused`), and the end stays as it was:
//       outside the disc (not drawn) · the deepest roadway is GRADE-SEPARATED (Boz, 2026-10-27: they cross at different
//       heights, and the mint takes them apart) · the foot lies on an OFF-GRADE run of the through street (`gradeRuns`: an
//       off-grade run, or a mixed run within an off-grade way's extent) · either new corner is degenerate or acute
//       (`tileGround.js#outlineCorner`, the mint's own predicate, at E with two legs and at F with three) · ⛔ the through
//       street has an AUTHORED slot at or after the block the foot cuts (Boz's ruling, 2026-10-27, on Zob's read): segOrd is
//       topology (`chainSegmentation.js#resolveChainSegmentation`), so a new crossing re-keys every block after it and each
//       authored width, cap and material there would land on the wrong block. Authoring is read ONLY to refuse. The block
//       holding the foot counts too: its slot would stop covering the half past F. The key's migration is the open key
//       (EXTENT-DESIGN §4.1), Jacob's.
//   · JOINED: F, the foot of the perpendicular on the through street's line (on the lattice), goes into the through street as
//     a vertex (or is that street's existing vertex within a lattice unit of it), and is added to the joining chain past its end
//     (E keeps its index's identity: `hard`, its anchor). An end within a lattice unit of the line adds no leg: E itself goes
//     into the through street. F is `hard` on both chains (it is a node), and the joined end's cap becomes the node's: `butt`,
//     degree = the chains meeting at F. Every index field (`anchorAt`, `hard`, `gradeRuns` from/to) is moved by ONE old→new
//     map per chain, after every insert is known; arc-length fields (`offExtents`, `structureExtents`) are unchanged because F
//     lies on the line.
// ⭐ The override is ASPIRATION (unbuilt, home unruled — BRIEF §1): every join is in the record and printed, so none is silent.
import { CLIP_SCALE } from '../src/lib/lattice.js'
import { resolveProtoMeasure, outlineCorner } from '../src/lib/tileGround.js'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'

const LAT = 1 / CLIP_SCALE
// the mint's node key: a vertex on the lattice ①'s union snaps to (exported, so a check reads it rather than restating it)
export const nodeKey = (p) => Math.round(p[0] * CLIP_SCALE) + ',' + Math.round(p[1] * CLIP_SCALE)
const K = nodeKey
const onLattice = (p) => [Math.round(p[0] * CLIP_SCALE) / CLIP_SCALE, Math.round(p[1] * CLIP_SCALE) / CLIP_SCALE]
const r3 = (v) => Math.round(v * 1000) / 1000

/**
 * @param streets   the mint's at-grade streets (mintInputs: tessellated `points`, `hard`, `gradeRuns`, `measure`, `caps`, `skelId`)
 * @param gradeSep  the mint's grade-separated chains (stroked too, so they make nodes and are judged, never joined)
 * @param discAt    discOf's { dist, R }: an end outside the disc is not drawn, so not joined
 * @param blockCustoms the town's authored slots, read ONLY to refuse a join that would re-key them ({} when none are authored)
 * @returns { streets, joins: [{ street, end, into, foot, d, hw, side, joined, why? }] }
 */
export function joinChainEnds({ streets, gradeSep = [], discAt, blockCustoms }) {
  if (!discAt || typeof discAt.dist !== 'function') throw new Error('[chainJoins] ⛔ no disc — an end outside it is not drawn, and only the disc can say so')
  if (!blockCustoms || typeof blockCustoms !== 'object') throw new Error('[chainJoins] ⛔ no blockCustoms ({} when the town authors none) — a join that re-keys an authored slot must refuse, and only the authoring can say whether one is there')
  const all = [...streets.map((st, ci) => ({ st, ci, gs: false })), ...gradeSep.map(st => ({ st, ci: -1, gs: true }))].filter(x => x.st?.points?.length >= 2)
  const degree = new Map()
  for (const { st } of all) st.points.forEach((p, i, P) => { const k = K(p); degree.set(k, (degree.get(k) || 0) + (i === 0 || i === P.length - 1 ? 1 : 2)) })
  const hwOf = (st, side) => resolveProtoMeasure({ skelId: st.skelId, side, segOrd: null, baseMeasure: st.measure, hwy: false }, null, 0)?.pavementHW
  const G = 50, grid = new Map()
  all.forEach((x, xi) => { const P = x.st.points; for (let k = 0; k + 1 < P.length; k++) { const a = P[k], b = P[k + 1]
    for (let gx = Math.floor(Math.min(a[0], b[0]) / G); gx <= Math.floor(Math.max(a[0], b[0]) / G); gx++) for (let gz = Math.floor(Math.min(a[1], b[1]) / G); gz <= Math.floor(Math.max(a[1], b[1]) / G); gz++) {
      const key = gx + ',' + gz; (grid.get(key) || grid.set(key, []).get(key)).push([xi, k]) } } })
  const seg = resolveChainSegmentation(streets)
  const segOrdAt = (st, i) => { const n = st.points.length; let so = 0; for (const k of seg.get(st) || []) if (k > 0 && k < n - 1 && k <= i) so++; return so }
  const name = (st) => st.skelId ?? st.name
  const joins = [], inserts = new Map(), ends = new Map()   // ci → [{ k, t, p }] · ci → { start?: p, end?: p }
  streets.forEach((st, ci) => { if (!(st?.points?.length >= 2)) return
    const P = st.points
    for (const end of ['start', 'end']) { const E = end === 'start' ? P[0] : P[P.length - 1]
      if (degree.get(K(E)) !== 1) continue
      let best = null
      for (let gx = Math.floor((E[0] - 60) / G); gx <= Math.floor((E[0] + 60) / G); gx++) for (let gz = Math.floor((E[1] - 60) / G); gz <= Math.floor((E[1] + 60) / G); gz++) for (const [xi, k] of grid.get(gx + ',' + gz) || []) {
        const x = all[xi]; if (x.st === st) continue
        const a = x.st.points[k], b = x.st.points[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) continue
        const t = Math.max(0, Math.min(1, ((E[0] - a[0]) * dx + (E[1] - a[1]) * dz) / L2)), d = Math.hypot(E[0] - a[0] - t * dx, E[1] - a[1] - t * dz)
        const side = dx * (E[1] - a[1]) - dz * (E[0] - a[0]) > 0 ? 'left' : 'right', hw = hwOf(x.st, side)
        if (!Number.isFinite(hw)) throw new Error(`[chainJoins] ⛔ ${name(x.st)} has no pour half-width on its ${side} — an end near it cannot be judged. Refusing.`)
        if (!best || d - hw < best.d - best.hw) best = { x, k, t, d, hw, side } }
      if (!best || best.d > best.hw) continue
      const row = { street: name(st), end, into: name(best.x.st), at: [r3(E[0]), r3(E[1])], d: r3(best.d), hw: r3(best.hw), side: best.side, joined: false }
      joins.push(row)
      if (discAt.dist(E[0], E[1]) > discAt.R) { row.why = 'outside the disc (not drawn)'; continue }
      if (best.x.gs) { row.why = 'the roadway is grade-separated (minted apart; not a T)'; continue }
      const T = best.x.st, k = best.k, a = T.points[k], b = T.points[k + 1]
      // the foot: E itself when it is within a lattice unit of the line; else the foot of the perpendicular, on the lattice
      let F = best.d <= LAT ? [E[0], E[1]] : onLattice([a[0] + best.t * (b[0] - a[0]), a[1] + best.t * (b[1] - a[1])])
      // an existing vertex of the through street within a lattice unit of F is F
      let atVertex = Math.hypot(F[0] - a[0], F[1] - a[1]) <= LAT ? k : Math.hypot(F[0] - b[0], F[1] - b[1]) <= LAT ? k + 1 : -1
      if (atVertex >= 0) F = T.points[atVertex]
      row.foot = [r3(F[0]), r3(F[1])]
      // the foot's grade: the through street's run holding segment k
      const sAlong = (() => { let s = 0; for (let j = 0; j < k; j++) s += Math.hypot(T.points[j + 1][0] - T.points[j][0], T.points[j + 1][1] - T.points[j][1]); return s + Math.hypot(F[0] - a[0], F[1] - a[1]) })()
      const run = (T.gradeRuns || []).find(r => k >= r.from && k < r.to)
      if (run?.offGrade || (run?.mixed && (run.offExtents || []).some(([s0, s1]) => sAlong >= s0 && sAlong <= s1))) { row.why = `the foot lies on an off-grade run of ${row.into} (a bridge or tunnel span)`; continue }
      // the corners the join makes, asked of the mint's own predicate
      const legsF = atVertex >= 0 ? [atVertex - 1, atVertex + 1].filter(j => j >= 0 && j < T.points.length).map(j => ({ to: T.points[j] })) : [{ to: a }, { to: b }]
      if (best.d > LAT) {
        const prev = end === 'start' ? P[1] : P[P.length - 2], cE = outlineCorner(E, [{ to: prev }, { to: F }])
        if (cE.bad) { row.why = `the new corner at the end is ${cE.bad}`; continue }
        legsF.push({ to: E })
      } else { const prev = end === 'start' ? P[1] : P[P.length - 2]; legsF.push({ to: prev }) }
      const cF = outlineCorner(F, legsF)
      if (cF.bad) { row.why = `the new corner on ${row.into} is ${cF.bad}`; continue }
      // ⛔ an authored slot the new crossing would re-key: the block holding the foot, and every block after it
      if (atVertex < 0 || !(seg.get(T) || new Set()).has(atVertex)) {
        const s0 = segOrdAt(T, k), bc = blockCustoms[T.skelId] || {}
        const hit = ['left', 'right'].flatMap(sd => Object.keys(bc[sd] || {}).filter(o => Number(o) >= s0).map(o => `${sd}|${o}`))
        if (hit.length) { row.why = `${row.into} has authored slot(s) at or after segOrd ${s0}, which this crossing would re-key: ${hit.join(' · ')} (BRIEF §1; the key's migration is Jacob's, EXTENT-DESIGN §4.1)`; continue }
      }
      row.joined = true
      const ti = streets.indexOf(T)
      if (atVertex < 0) (inserts.get(ti) || inserts.set(ti, []).get(ti)).push({ k, t: best.t, p: F })
      if (best.d > LAT) (ends.get(ci) || ends.set(ci, {}).get(ci))[end] = F
      row.degree = (degree.get(K(F)) || 0) + (atVertex >= 0 ? 0 : 2) + 1
    } })
  // ⭐ ONE old→new index map per chain, after every insert is known
  const out = streets.map((st, ci) => {
    const ins = (inserts.get(ci) || []).sort((u, v) => u.k - v.k || u.t - v.t), E2 = ends.get(ci) || {}
    const myJoins = joins.filter(j => j.joined && j.street === name(st))
    if (!ins.length && !E2.start && !E2.end && !myJoins.length) return st
    const P = st.points, pts = [], hard = [], map = []
    const hard0 = st.hard            // null: every vertex is hard (tileGround.js's stamp reads `hardAt ? !!hardAt[i] : true`), F included
    if (E2.start) { pts.push(E2.start); hard.push(true) }
    let q = 0
    for (let i = 0; i < P.length; i++) {
      map[i] = pts.length; pts.push(P[i]); hard.push(hard0 ? !!hard0[i] : true)
      while (q < ins.length && ins[q].k === i) { pts.push(ins[q].p); hard.push(true); q++ } }
    if (E2.end) { pts.push(E2.end); hard.push(true) }
    const last = pts.length - 1
    const gradeRuns = st.gradeRuns && st.gradeRuns.map((r, i, R) => ({ ...r, from: i === 0 ? 0 : map[r.from], to: i === R.length - 1 ? last : map[r.to] }))
    const caps = st.caps && { ...st.caps }
    for (const j of myJoins) if (caps) caps[j.end] = { ...(caps[j.end] || {}), cap: 'butt', degree: j.degree }
    const P2 = pts
    if (P.anchorAt) P2.anchorAt = P.anchorAt.map(i => map[i])
    return { ...st, points: P2, hard: hard0 ? hard : null, ...(gradeRuns && { gradeRuns }), ...(caps && { caps }) }
  })
  return { streets: out, joins }
}

/** The pour's line for the record: joined, then not joined with each reason, by name. */
export function reportJoins(joins, who) {
  const j = joins.filter(x => x.joined), n = joins.filter(x => !x.joined)
  const row = (x) => `${x.street}.${x.end}→${x.into} ${x.d}/${x.hw} m${x.why ? ` (${x.why})` : ''}`
  return `    [①] chain ends in a roadway (r-a-chain-end-in-a-roadway-is-a-T, ${who}): ${j.length} joined as a T${j.length ? `: ${j.map(row).join(' · ')}` : ''}${n.length ? ` · ${n.length} NOT joined: ${n.map(row).join(' · ')}` : ''}`
}
