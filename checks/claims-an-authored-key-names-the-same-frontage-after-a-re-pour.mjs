// claims-an-authored-key-names-the-same-frontage-after-a-re-pour.mjs — WHEN A TOWN'S SKELETON IS RE-POURED, DOES EVERY KEY
// THE OPERATOR AUTHORED STILL NAME THE SAME PIECE OF GROUND?
//
// ⭐ THE CLASS (`EXTENT-DESIGN §4.1`, "the key is open"): authoring is keyed by POSITION, not by geometry. A `blockCustoms`
//   slot is `skelId → side → segOrd`, and `segOrd` is a COUNT — the number of intersection vertices at or before a point on
//   the chain (`mintProtopolygon`'s `segOrdAt`, over `resolveChainSegmentation`). A re-pour that adds a junction, splits a
//   chain, re-welds it or reverses it leaves every key in place while the ground under it moves: the value lands on another
//   block's frontage, or on nothing, and nothing says so. A town nobody looked at would re-pour and quietly re-author itself.
// ⭐ JUDGED BY GEOMETRY, never by name. Each key is resolved to the stretch of centreline it names IN EACH SKELETON, exactly as
//   the mint does: the chain's points tessellated by derive's own `tessellateAdaptive`, the street set derive's own
//   (`ribbonStreets`: every skeleton chain with a name and ≥ 2 points; grade-separated chains apart, and stamped segOrd 0 by the
//   mint), the intersections by `resolveChainSegmentation` (imported, not copied), the slot by `naturalSegments`' rule. The
//   BEFORE stretch is then looked up in the AFTER skeleton by its own geometry: every station along it finds the after-chain
//   lying under it (within the segmentation's own node tolerance, read from `chainSegmentation.js`), running the same way.
//   Verdicts, per key:
//     SAME      the same skelId · side · segOrd is the nearest centreline under every station, and that key's after-stretch is
//               the before-stretch (its length within the node tolerance)
//     MOVES     one other key lies under every station (the ground survives; the authored slot no longer names it)
//     SPLITS    more than one key lies under it — or the same key covers only part of it, or more than it (changes meaning)
//     REFINED   some stations lie under no after-chain, but the SAME key's after-slot runs between the same two ends (each
//               within the node tolerance, start to start) — the same frontage between the same two intersections, its line
//               re-drawn (a refined OSM curve). NOT red; printed with its largest lateral move, because it is a real change
//               of the drawn edge that the operator may want to see. ⛔ The node tolerance is the SEGMENTATION's (two vertices
//               within it are one node), not a "same street" test, so a refined line falls outside it without being lost.
//     DIES      no after-chain lies under some station, and the slot's ends do not survive either
//   Corner keys (`cornerCornerRadiusOverrides`, `cornerRadiusOverrides`: `x,z|skelA:side|skelB:side`) are judged the same way
//   at their node: each leg's chain carries the node in both skeletons and runs the same way through it (a reversed chain
//   swaps its sides, and the key names the other corner). A leg whose id is gone, or no longer passes the node, is looked
//   up BY GEOMETRY — the before leg's edge at the node, through the same station search as a slot — so a chain that was
//   only RENAMED (positional ids like `<highway>-<n>` renumber when an earlier way is added or removed) reads MOVES, with
//   its new id; DIES only when no after-chain lies along that edge. A key whose sides are not left/right is a LEGACY form
//   the ① mint never produces (`protoCornerOf`): dead before and after, said.
// ⛔ A skeleton carrying two AT-GRADE chains with one id REFUSES (either side): every key on that id is ambiguous, and the
//   pour itself refuses it (skeleton.js, derive.js). A by-id map would silently keep one of the two.
// ⭐ BESIDE PARITY, WHAT IS LIVE TODAY: each blockCustoms key is looked up in the SERVED slab's runs (`shape.json`
//   tile.runs). A key that owns no run is authored but drawn nowhere — before any re-pour. Printed, never folded into parity.
// ⛔ The BEFORE street set is proven against the town's own frozen ribbons (`ribbons.json` streets: skelId · gradeSeparated)
//   before anything is judged; a mismatch REFUSES, because then this is not derive's segmentation.
//
//   node checks/claims-an-authored-key-names-the-same-frontage-after-a-re-pour.mjs --scene=<scene> --after=<skeleton.json>
//        [--before=<skeleton.json>] [--ribbons=<ribbons.json>] [--design=<design.json>] [--shape=<shape.json>] [--selftest]
//   --after is the re-poured skeleton, written somewhere that is NOT the town's clean/ (skeleton.js --out=<path>).
// @args --after=<path>   (unbounded: npm test cannot supply a re-pour, so it is BLOCKED by this declaration, counted — tier.mjs)
// Exit 1: any authored key that is not SAME, a before set that is not derive's, or a missing input.
// ⭐ MUTATION TEST (`--selftest`, in memory, on the town's own before skeleton): after = before → GREEN; after with a junction
//   added on an authored slot (one segOrd renumbered) → RED; after with an authored chain reversed → RED; after with an
//   authored chain removed → RED; an at-grade id duplicated → REFUSED (RED); a corner leg's chain renamed → RED, verdict
//   MOVES (not DIES); an authored slot's line bent 2 node-tolerances off, its ends kept → GREEN, verdict REFINED.
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tessellateAdaptive } from '../cartograph/derive.js'
import { resolveChainSegmentation } from '../src/lib/chainSegmentation.js'
import { LATTICE_M } from '../src/lib/lattice.js'
import { ribbonsPath } from './_scenes.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const SELFTEST = process.argv.includes('--selftest')
const scene = arg('scene')
if (!scene) { console.error('⛔ --scene=<scene> is required'); process.exit(1) }
const clean = join(ROOT, 'cartograph/data', scene, 'clean')
const paths = {
  before: arg('before') || join(clean, 'skeleton.json'),
  after: arg('after'),
  ribbons: arg('ribbons') || join(ROOT, ribbonsPath(scene)),   // the town's DECLARED ribbons (cartograph/scene.js#ribbonsPathOf), never assumed to be clean/
  design: arg('design') || join(ROOT, 'public/looks', scene, 'design.json'),
  shape: arg('shape') || join(ROOT, 'public/baked', scene, 'shape.json'),
}
for (const k of ['before', 'ribbons', 'design', ...(SELFTEST ? [] : ['after'])])
  if (!paths[k] || !existsSync(paths[k])) { console.error(`⛔ ${scene}: no ${k} at ${paths[k] ?? '(not given: --' + k + '=)'}`); process.exit(1) }
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'))

// the segmentation's own node tolerance, READ from its source (it is a local of resolveChainSegmentation, not exported)
const SEG_EPS = (() => { const m = readFileSync(join(ROOT, 'src/lib/chainSegmentation.js'), 'utf8').match(/const EPS = ([\d.]+)/)
  if (!m) throw new Error('⛔ chainSegmentation.js no longer states `const EPS = …` — this check cannot read its node tolerance'); return +m[1] })()
const STATION_M = SEG_EPS            // a station every node-tolerance along the stretch: nothing shorter can hide between two

// ── one skeleton → derive's street set, tessellated, segmented ───────────────────────────────────────────────────────
function model(sk) {
  const streets = (sk.streets || []).filter(s => s.name && s.points?.length >= 2).map(s => {
    const pts = tessellateAdaptive(s.points.map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), s.segments)
    return { skelId: s.id, gradeSeparated: !!s.gradeSeparated, points: pts }
  }).filter(s => s.points?.length >= 2)
  const flat = streets.filter(s => !s.gradeSeparated)
  { const seen = new Map(), dup = []
    for (const s of flat) { if (seen.has(s.skelId)) dup.push(s.skelId); else seen.set(s.skelId, s) }
    if (dup.length) throw new Error(`two at-grade chains share the id ${[...new Set(dup)].join(', ')} — every key on it is ambiguous (the pour refuses it too)`) }
  const seg = resolveChainSegmentation(flat)
  const byId = new Map()
  for (const s of streets) {
    const n = s.points.length
    const ix = s.gradeSeparated ? [] : [...(seg.get(s) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
    const slots = []; let prev = 0                      // naturalSegments' rule: slot k = points [ix_k … ix_k+1]
    for (const i of ix) { if (i > prev) slots.push([prev, i]); prev = i }
    if (prev < n - 1) slots.push([prev, n - 1])
    if (!slots.length) slots.push([0, n - 1])
    byId.set(s.skelId, { ...s, slots })
  }
  return { streets, byId }
}
const sub = (P, [a, b]) => P.slice(a, b + 1)
const len = (P) => P.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0)
const stations = (P) => { const out = []
  for (let i = 0; i + 1 < P.length; i++) { const A = P[i], B = P[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Math.max(1, Math.ceil(L / STATION_M))
    for (let j = 0; j < k; j++) { const t = (j + 0.5) / k; out.push({ p: [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], d: L ? [(B[0] - A[0]) / L, (B[1] - A[1]) / L] : [0, 0] }) } }
  return out }

// an index of every after-chain edge, by grid cell, so a station finds the edges under it without a scan
function edgeIndex(M) {
  const G = 8, grid = new Map(), E = []
  for (const s of M.byId.values()) s.points.forEach((A, i) => { if (i + 1 >= s.points.length) return; const B = s.points[i + 1]
    const id = E.push({ s, i, A, B }) - 1
    for (let x = Math.floor((Math.min(A[0], B[0]) - SEG_EPS) / G); x <= Math.floor((Math.max(A[0], B[0]) + SEG_EPS) / G); x++)
      for (let z = Math.floor((Math.min(A[1], B[1]) - SEG_EPS) / G); z <= Math.floor((Math.max(A[1], B[1]) + SEG_EPS) / G); z++)
        (grid.get(x + ',' + z) || grid.set(x + ',' + z, []).get(x + ',' + z)).push(id) })
  const slotOf = (s, i) => { if (s.gradeSeparated) return 0; for (let k = 0; k < s.slots.length; k++) if (i < s.slots[k][1]) return k; return s.slots.length - 1 }
  // the after-keys whose centreline lies under P (within SEG_EPS), each with the way it runs relative to d
  const under = (P, d) => { const out = new Map()
    for (const id of grid.get(Math.floor(P[0] / G) + ',' + Math.floor(P[1] / G)) || []) { const { s, i, A, B } = E[id]
      const ex = B[0] - A[0], ez = B[1] - A[1], L2 = ex * ex + ez * ez; if (!L2) continue
      const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * ex + (P[1] - A[1]) * ez) / L2))
      const q = Math.hypot(P[0] - A[0] - t * ex, P[1] - A[1] - t * ez); if (q > SEG_EPS) continue
      const dot = (ex * d[0] + ez * d[1]) / Math.sqrt(L2); if (Math.abs(dot) < 0.5) continue          // a crossing street, not this one
      const k = `${s.skelId}|${dot > 0 ? '+' : '-'}|${slotOf(s, i)}`, o = out.get(k); if (!o || q < o.q) out.set(k, { skelId: s.skelId, flip: dot < 0, segOrd: slotOf(s, i), q }) }
    // ⭐ ONE KEY PER STATION: the centreline NEAREST it. Near a node a neighbouring slot or an oblique street also lies within
    //   the tolerance; the station is the stretch's own ground, and the chain under it is the one it lies ON.
    const all = [...out.values()].sort((u, v) => u.q - v.q); return all.length ? [all[0]] : [] }
  return { under }
}
const flipSide = (side) => side === 'left' ? 'right' : side === 'right' ? 'left' : side

// ── the authored keys ───────────────────────────────────────────────────────────────────────────────────────────────
function authoredKeys(design) {
  const keys = []
  for (const [skelId, bySide] of Object.entries(design.blockCustoms || {}))
    for (const [side, bySeg] of Object.entries(bySide || {})) for (const seg of Object.keys(bySeg || {}))
      keys.push({ map: 'blockCustoms', kind: 'slot', skelId, side, segOrd: +seg, key: `${skelId}|${side}|${seg}` })
  for (const [k, v] of Object.entries(design.blockLandUse || {})) keys.push({ map: 'blockLandUse', kind: 'unread', key: k, v })
  for (const map of ['cornerCornerRadiusOverrides', 'cornerRadiusOverrides'])
    for (const k of Object.keys(design[map] || {})) { const [xz, ...legs] = k.split('|'), [x, z] = xz.split(',').map(Number)
      keys.push({ map, kind: 'corner', key: k, at: [x, z], legs: legs.map(l => { const c = l.lastIndexOf(':'); return { skelId: l.slice(0, c), side: l.slice(c + 1) } }) }) }
  return keys
}

// ── judge one slot key ──────────────────────────────────────────────────────────────────────────────────────────────
function judgeSlot(K, B, A, idxA) {
  const sB = B.byId.get(K.skelId)
  if (!sB) return { verdict: 'DEAD BEFORE', why: `no chain ${K.skelId} in the before skeleton` }
  const slotB = sB.gradeSeparated ? [0, sB.points.length - 1] : sB.slots[K.segOrd]
  if (!slotB) return { verdict: 'DEAD BEFORE', why: `${K.skelId} has ${sB.slots.length} slot(s) before; segOrd ${K.segOrd} names none` }
  const P = sub(sB.points, slotB), st = stations(P)
  const hits = new Map(); let lost = 0
  for (const { p, d } of st) { const u = idxA.under(p, d); if (!u.length) { lost++; continue }
    for (const h of u) { const k = `${h.skelId}|${h.flip ? flipSide(K.side) : K.side}|${h.segOrd}`; hits.set(k, (hits.get(k) || 0) + 1) } }
  const before = `${len(P).toFixed(1)} m (${K.skelId} pts ${slotB[0]}–${slotB[1]})`
  if (lost) {
    // the same key's after-slot between the same two ends (start to start): the frontage survives, its line re-drawn
    const sA = A.byId.get(K.skelId), slotA = sA && (sA.gradeSeparated ? (K.segOrd === 0 ? [0, sA.points.length - 1] : null) : sA.slots[K.segOrd])
    if (slotA) { const Q = sub(sA.points, slotA), d0 = Math.hypot(Q[0][0] - P[0][0], Q[0][1] - P[0][1]), d1 = Math.hypot(Q.at(-1)[0] - P.at(-1)[0], Q.at(-1)[1] - P.at(-1)[1])
      if (d0 <= SEG_EPS && d1 <= SEG_EPS) {
        const off = (p) => { let m = Infinity; for (let i = 0; i + 1 < Q.length; i++) { const a = Q[i], b = Q[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2)); m = Math.min(m, Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ez)) } return m }
        const mx = Math.max(...st.map(x => off(x.p)))
        return { verdict: 'REFINED', why: `same key, same two ends (${d0.toFixed(3)} / ${d1.toFixed(3)} m); its line re-drawn, ${lost} of ${st.length} station(s) past the node tolerance, largest lateral move ${mx.toFixed(2)} m · before ${before}, after ${len(Q).toFixed(1)} m` } } }
    return { verdict: 'DIES', why: `${lost} of ${st.length} station(s) of the before-stretch ${before} lie under no after-chain, and its slot's ends do not survive${hits.size ? `; the rest under ${[...hits.keys()].join(', ')}` : ''}` } }
  const same = `${K.skelId}|${K.side}|${K.segOrd}`
  if (hits.size === 1 && hits.has(same)) {
    // the same key lies under all of it — does its after-stretch hold MORE than the before-stretch?
    const sA = A.byId.get(K.skelId), slotA = sA.gradeSeparated ? [0, sA.points.length - 1] : sA.slots[K.segOrd]
    const LA = len(sub(sA.points, slotA)), LB = len(P)
    if (Math.abs(LA - LB) > SEG_EPS) return { verdict: 'SPLITS', why: `${same} still lies under the before-stretch ${before}, but now names ${LA.toFixed(1)} m (pts ${slotA[0]}–${slotA[1]}): it covers more ground than was authored` }
    return { verdict: 'SAME', why: before }
  }
  if (hits.size === 1) return { verdict: 'MOVES', why: `the before-stretch ${before} is now ${[...hits.keys()][0]}; the authored slot ${same} names other ground or none` }
  return { verdict: 'SPLITS', why: `the before-stretch ${before} lies under ${[...hits.entries()].map(([k, n]) => `${k} (${n}/${st.length})`).join(', ')}` }
}

// ── judge one corner key ────────────────────────────────────────────────────────────────────────────────────────────
function judgeCorner(K, B, A, idxA) {
  if (K.legs.length !== 2 || K.legs.some(l => l.side !== 'left' && l.side !== 'right'))
    return { verdict: 'DEAD BEFORE', why: `legacy key form (sides ${K.legs.map(l => l.side).join('/')}); the ① mint keys corners skelId:left|right (protoCornerOf), so no corner ever reads it` }
  const near = (M, skelId) => { const s = M.byId.get(skelId); if (!s) return null
    let best = null; s.points.forEach((p, i) => { const q = Math.hypot(p[0] - K.at[0], p[1] - K.at[1]); if (!best || q < best.q) best = { q, i } })
    if (best.q > LATTICE_M) return { s, off: best.q }
    const i = best.i, a = s.points[Math.max(0, i - 1)], b = s.points[Math.min(s.points.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return { s, i, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] } }
  const rows = []
  for (const l of K.legs) { const b = near(B, l.skelId), a = near(A, l.skelId)
    if (!b) return { verdict: 'DEAD BEFORE', why: `no chain ${l.skelId} before` }
    if (b.off != null) return { verdict: 'DEAD BEFORE', why: `${l.skelId} carries no vertex at the key's node before (nearest ${b.off.toFixed(3)} m)` }
    if (!a || a.off != null) {
      // BY GEOMETRY: the before leg's edge leaving the node (toward the neighbour it runs to), searched like a slot's stations
      const P = b.s.points, j = b.i < P.length - 1 ? b.i + 1 : b.i - 1, seg = [P[b.i], P[j]]
      const hit = new Map(); for (const { p, d } of stations(seg)) for (const h of idxA.under(p, d)) { const k = `${h.skelId}|${h.flip ? '-' : '+'}`; hit.set(k, (hit.get(k) || 0) + 1) }
      const top = [...hit.entries()].sort((x, y) => y[1] - x[1])[0]
      if (!top) { rows.push(`${l.skelId} ${!a ? 'is gone' : `no longer passes through the node (nearest vertex ${a.off.toFixed(3)} m)`}, and no after-chain lies along its edge at the node`); continue }
      const [id, dir] = top[0].split('|'), side = dir === '-' ? flipSide(l.side) : l.side
      rows.push(`${l.skelId}:${l.side} is now ${id}:${side} (by geometry along its edge at the node${id === l.skelId ? '' : '; renamed'}${!a ? '' : '; the node moved'})`); continue }
    if (b.d[0] * a.d[0] + b.d[1] * a.d[1] < 0) rows.push(`${l.skelId} runs the other way through the node: its ${l.side} is now its ${flipSide(l.side)}`) }
  return rows.length ? { verdict: rows.some(r => /no after-chain lies along/.test(r)) ? 'DIES' : 'MOVES', why: rows.join(' · ') } : { verdict: 'SAME', why: 'both legs pass through the node, running the same way' }
}

// ── what is live today: a slot key that owns a run in the served slab ─────────────────────────────────────────────────
function servedRuns() {
  if (!existsSync(paths.shape)) return null
  const sh = readJSON(paths.shape), set = new Set()
  for (const t of sh.tiles || []) for (const r of t.runs || []) set.add(`${r.skelId}|${r.side}|${r.segOrd}`)
  return set
}

function run(beforeSk, afterSk, { quiet = false } = {}) {
  const B = model(beforeSk), A = model(afterSk), idxA = edgeIndex(A)
  const keys = authoredKeys(readJSON(paths.design)), live = servedRuns()
  const res = keys.map(K => ({ K, ...(K.kind === 'slot' ? judgeSlot(K, B, A, idxA) : K.kind === 'corner' ? judgeCorner(K, B, A, idxA) : { verdict: 'NOT JUDGED', why: 'blockLandUse keys are not slot or corner keys; their form is not read here' }) }))
  const bad = res.filter(r => !['SAME', 'DEAD BEFORE', 'REFINED'].includes(r.verdict))
  if (!quiet) {
    console.log(`${scene}: ${keys.length} authored key(s) · before ${paths.before} · after ${paths.after ?? '(selftest)'} · node tolerance ${SEG_EPS} m (chainSegmentation.js)`)
    for (const r of res) { const l = r.K.kind === 'slot' && live ? (live.has(r.K.key) ? '' : '  ⚠️ owns NO run in the served slab today') : ''
      console.log(`  ${r.verdict === 'SAME' ? '✅' : r.verdict === 'DEAD BEFORE' ? '⚪' : r.verdict === 'REFINED' ? '🔶' : '⛔'} ${r.verdict.padEnd(11)} ${r.K.map}  ${r.K.key}  — ${r.why}${l}`) }
    const dead = res.filter(r => r.verdict === 'DEAD BEFORE').length, refined = res.filter(r => r.verdict === 'REFINED').length, unlive = live ? res.filter(r => r.K.kind === 'slot' && !live.has(r.K.key)).length : null
    console.log(`\n${bad.length ? '⛔' : '✅'} ${res.length - bad.length - dead - refined} SAME · ${refined} REFINED (same frontage, line re-drawn) · ${bad.length} that move, split or die · ${dead} dead before the re-pour (unchanged by it)${unlive != null ? ` · ${unlive} slot key(s) owning no run in the served slab` : ' · served slab not found: liveness not judged'}`)
  }
  return { res, bad }
}

const before = readJSON(paths.before)
// ⛔ the before street set must BE derive's: the frozen ribbons' skelIds and grade flags, exactly
{ const rb = readJSON(paths.ribbons), R = new Map((rb.streets || []).map(s => [s.skelId, !!s.gradeSeparated]))
  let M; try { M = model(before) } catch (e) { console.error(`⛔ ${scene}: the BEFORE skeleton refuses — ${e.message}`); process.exit(1) }
  const diff = []
  for (const s of M.streets) if (!R.has(s.skelId)) diff.push(`${s.skelId} in the skeleton set, not in ribbons`); else if (R.get(s.skelId) !== s.gradeSeparated) diff.push(`${s.skelId} gradeSeparated ${s.gradeSeparated} here, ${R.get(s.skelId)} in ribbons`)
  for (const id of R.keys()) if (!M.byId.has(id)) diff.push(`${id} in ribbons, not in the skeleton set`)
  if (diff.length) { console.error(`⛔ ${scene}: the before street set is not derive's (${diff.length}): ${diff.slice(0, 8).join(' · ')}${diff.length > 8 ? ' …' : ''}`); process.exit(1) }
  if (!SELFTEST) console.log(`(before set = derive's: ${R.size} street(s) match ${paths.ribbons}, skelId and gradeSeparated)`) }

if (SELFTEST) {
  const clone = () => JSON.parse(JSON.stringify(before))
  const slotKeys = authoredKeys(readJSON(paths.design)).filter(k => k.kind === 'slot')
  if (!slotKeys.length) { console.error(`⛔ ${scene} authors no slot key: the mutations have nothing to move`); process.exit(1) }
  const target = slotKeys[0], M = model(before), s = M.byId.get(target.skelId), slot = s?.slots[target.segOrd]
  if (!slot) { console.error(`⛔ selftest: ${target.key} is dead before; pick a town whose first slot key is live`); process.exit(1) }
  const cornerKey = (() => { const id = run(before, clone(), { quiet: true }).res; return id.find(r => r.K.kind === 'corner' && r.verdict === 'SAME')?.K || null })()
  const P = sub(s.points, slot), mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2], e = [P[1][0] - P[0][0], P[1][1] - P[0][1]], eL = Math.hypot(e[0], e[1])
  const cases = [
    ['after = before', clone, false],
    // a new street meets the slot's first edge at its midpoint: the mint counts one more intersection there, so every later
    // segOrd on the chain is renumbered (the curve segments, index-referenced, get a straight piece at the new vertex)
    ['a junction added mid-slot (segOrd renumbered)', () => { const sk = clone(), st = sk.streets.find(x => x.id === target.skelId), at = { x: mid[0], z: mid[1] }
      st.points.splice(slot[0] + 1, 0, at)
      if (st.segments) st.segments.splice(slot[0], 1, { type: 'line' }, { type: 'line' })
      sk.streets.push({ id: '__selftest-crossing__', name: 'Selftest Crossing', points: [{ x: mid[0] - 20 * e[1] / eL, z: mid[1] + 20 * e[0] / eL }, at] })
      return sk }, true],
    ['an authored chain reversed', () => { const sk = clone(), st = sk.streets.find(x => x.id === target.skelId); st.points.reverse()
      if (st.segments) st.segments = st.segments.reverse().map(g => g.type === 'bezier' ? { ...g, c1: g.c2, c2: g.c1 } : g)
      return sk }, true],
    ['an authored chain removed', () => { const sk = clone(); sk.streets = sk.streets.filter(x => x.id !== target.skelId); return sk }, true],
    ['an at-grade id duplicated (refuses)', () => { const sk = clone(), st = sk.streets.find(x => x.id === target.skelId)
      sk.streets.push({ ...JSON.parse(JSON.stringify(st)), name: st.name + ' (selftest twin)', points: st.points.map(q => ({ x: q.x + 1000, z: q.z + 1000 })) }); return sk }, true],
    // the refined line: one new vertex on the slot's first edge, pushed 2 node-tolerances sideways, no street meeting it
    ['an authored slot\'s line bent, its ends kept (REFINED)', () => { const sk = clone(), st = sk.streets.find(x => x.id === target.skelId)
      st.points.splice(slot[0] + 1, 0, { x: mid[0] - 2 * SEG_EPS * e[1] / eL, z: mid[1] + 2 * SEG_EPS * e[0] / eL })
      if (st.segments) st.segments.splice(slot[0], 1, { type: 'line' }, { type: 'line' })
      return sk }, false, { key: target.key, verdict: 'REFINED' }],
    ...(cornerKey ? [['a corner leg\'s chain renamed (MOVES, not DIES)', () => { const sk = clone(), st = sk.streets.find(x => x.id === cornerKey.legs[0].skelId)
      st.id = st.id + '-selftest-renamed'; return sk }, true, { key: cornerKey.key, verdict: 'MOVES' }]] : []),
  ]
  if (!cornerKey) console.log('  ⚪ the town authors no live corner key: the rename row is not run, said')
  let ok = true
  for (const [name, mk, wantRed, want] of cases) {
    let R = null, refused = null; try { R = run(before, mk(), { quiet: true }) } catch (e) { refused = e.message }
    const red = refused != null || R.bad.length > 0, got = want && R ? R.res.find(r => r.K.key === want.key)?.verdict : null
    const pass = red === wantRed && (!want || got === want.verdict)
    console.log(`  ${pass ? '✅' : '⛔'} ${name}: ${red ? 'RED' : 'GREEN'} (want ${wantRed ? 'RED' : 'GREEN'})${want ? ` · ${want.key} → ${got ?? '—'} (want ${want.verdict})` : ''}${refused ? ' — refused: ' + refused.slice(0, 90) : red ? ' — ' + R.bad.slice(0, 2).map(b => `${b.K.key} ${b.verdict}`).join(' · ') : ''}`)
    if (!pass) ok = false }
  console.log(ok ? '\n✅ selftest: every planted re-key is caught, and the identity re-pour passes' : '\n⛔ selftest: the instrument missed a planted case')
  process.exit(ok ? 0 : 1)
}

let out; try { out = run(before, readJSON(paths.after)) } catch (e) { console.error(`⛔ ${scene}: the AFTER skeleton refuses — ${e.message}`); process.exit(1) }
process.exit(out.bad.length ? 1 : 0)
