// absorbInk.js — THE ε INK IS ABSORBED INTO THE FACES AT THE MINT'S EXIT (BRIEF-the-ink-is-owned-by-its-labels §3.1–§3.2;
// Jacob, 2026-10-25: "after the mint there is no 5mm overlap. That is math that becomes absorbed and disappears").
//
// ① is the ink of the network, ε wide; its holes are the faces (blocks, and the water). Before this the strip belonged to NO
// face and was painted by re-stroked quads resolved by overlap (`inkByOwner` / `inkPiecesByOwner`, deleted). Now:
//   1. ONE noding pass (`latticeNode#nodeCrossings`) over ①'s ink rings, the frame rect and the water rings (closed) and the
//      sealed centrelines (open). Zob's read (Boz, 2026-10-25): the faces are walked from THIS noded set, never matched to
//      the boolean's faces afterwards, because that boolean split ink edges at the frame and the water (up to 1 unit off).
//   2. A half-edge walk of the arrangement. Each cycle's LEFT region is read off the edges it runs along — the ink's own
//      winding, the frame's, the water's — never by a point test: an ink CELL, a land face, the water, or nothing.
//      A land cycle is NAMED by its ink edges' labels: each ① label lies on exactly one face's edge, so the label says
//      which face (`blocks[k]`, holes included). Identity, carried.
//   3. Each cell joins the ONE group across its ink edges (a land face, or the water — "yes, coast slit joins the water").
//      Zero (inside the frame) or two REFUSES by name; the census prints per town. A cell beyond the frame is counted.
//   4. The face's painted boundary is SPLICED from the arrangement, not unioned: the half-edges with the face on their left
//      and another group on their right, linked at each vertex. No boolean, so nothing is rounded twice and every vertex
//      is one the neighbour shares — neighbours meet on the centreline exactly. Each edge carries a label: a centreline
//      edge the stroke's pass on the face's side (`own` right, `ownL` left), the frame its owner, the water its owner.
//      A dead end's spur is a dangling centreline inside one face's cell, so it is never a boundary: the face closes round it.
// → { paint: [{ outer, outerLabels, holes, holeLabels } | null per face], cells: [{ rings, labels, group }] (the cells whose
//   owners are water or a grade-separated highway — the classes the ground paints apart from the road), census }.
// ⛔ ② never reads this (Boz's ruling A(i)): it offsets the un-absorbed face, so the authoring keys cannot move.
import { nodeCrossings } from './latticeNode.js'
import { CLIP_SCALE } from './lattice.js'

const rl = (v) => Math.round(v * CLIP_SCALE) / CLIP_SCALE
const area2 = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a }

// THE POINT A HOLE CYCLE IS LINKED BY: a quarter unit to the LEFT (the face it bounds) of its longest edge with its antennas
// removed — a spur's edge is walked both ways in one cycle (its twin is in it too), and a point off it lies on the spur, not
// in the face (Zob, 2026-10-25). Exported for the check's planted row.
export function holeProbe(hs, who = '①') {
  const inN = new Set(hs), real = hs.filter(g => !inN.has(g.twin)), len = (g) => Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1])
  if (!real.length) throw new Error(`[${who}][absorb] ⛔ a hole cycle at (${hs[0].from.map(v => v / CLIP_SCALE)}) is all antenna — no side to probe. Refusing.`)
  const h = real.reduce((m, g) => len(g) > len(m) ? g : m, real[0])
  const dx = h.to[0] - h.from[0], dy = h.to[1] - h.from[1], L = Math.hypot(dx, dy)
  return [(h.from[0] + h.to[0]) / 2 - dy / L * 0.25, (h.from[1] + h.to[1]) / 2 + dx / L * 0.25]
}

export function absorbInk({ inkRings, inkLabels, frame, frameOwner, waterRings = [], waterOwner = null, centrelines, spokes = [], outlineRefused = [], faces, owners, who = '①', diag = null }) {
  // `diag` (optional, a diagnostic's): filled with the PLACES behind a refusal — what each refused face or cell is made of
  if (!Array.isArray(centrelines)) throw new Error(`[${who}][absorb] ⛔ no sealed centreline — nothing to cut the ink by. Refusing.`)
  // ── 1. the inputs, on the lattice, each knowing what it is ──
  const inputs = []
  inkRings.forEach((r, i) => { if (r?.length >= 3) inputs.push({ tag: 'ink', p: r.map(q => [rl(q[0]), rl(q[1])]), kind: 'ink', i }) })
  inputs.push({ tag: 'frame', p: frame.map(q => [rl(q[0]), rl(q[1])]), kind: 'frame' })
  waterRings.forEach((r, i) => { if (r?.length >= 3) inputs.push({ tag: 'water', p: r.map(q => [rl(q[0]), rl(q[1])]), kind: 'water', i }) })
  centrelines.forEach((c, i) => { if (c.points.length >= 2) inputs.push({ tag: 'centreline', p: c.points.map(q => [rl(q[0]), rl(q[1])]), kind: 'cl', i, open: !c.closed }) })
  // the wedge spokes (mint: node → outline point): they divide a cell between the strokes meeting at a node
  spokes.forEach((sp, i) => { const p = sp.map(q => [rl(q[0]), rl(q[1])]); if (p[0][0] !== p[1][0] || p[0][1] !== p[1][1]) inputs.push({ tag: 'spoke', p, kind: 'spoke', i, open: true }) })
  const R = nodeCrossings(inputs.map(x => ({ tag: x.tag, p: x.p, open: !!x.open })), { pairs: () => true, who: `${who} absorb` })
  // the ink's filled side: Clipper winds an outer and its holes opposite, the region always on one side — read off the
  // largest ring (an outer), never assumed. The frame rect and each water ring by their own winding.
  let big = -1, bigA = 0; inputs.forEach((x, n) => { if (x.kind === 'ink') { const a = Math.abs(area2(x.p)); if (a > bigA) { bigA = a; big = n } } })
  const inkOnLeft = big < 0 ? true : area2(inputs[big].p) > 0
  const sideOf = inputs.map(x => x.kind === 'cl' ? 0 : (area2(x.p) > 0 ? 1 : -1))   // +1: the filled side is LEFT of the ring's direction
  // ── 2. the arrangement ──
  const key = (k) => k[0] + ',' + k[1]
  const edges = new Map()      // "a|b" (a < b by key) → { a, b, tags: [] }
  R.forEach((o, n) => { const x = inputs[n], m = o.length, last = x.open ? m - 1 : m
    for (let j = 0; j < last; j++) { const u = o[j], v = o[(j + 1) % m]
      if (u.k[0] === v.k[0] && u.k[1] === v.k[1]) continue
      const ku = key(u.k), kv = key(v.k), fwd = ku < kv, id = fwd ? ku + '|' + kv : kv + '|' + ku
      let e = edges.get(id); if (!e) edges.set(id, e = { a: fwd ? u.k : v.k, b: fwd ? v.k : u.k, tags: [] })
      // `along`: this input runs a → b along the edge
      if (x.kind === 'ink') e.tags.push({ kind: 'ink', label: inkLabels[x.i]?.[u.edge] ?? null, along: fwd, ring: x.i })
      else if (x.kind === 'cl') e.tags.push({ kind: 'cl', rec: x.i, seg: u.edge, along: fwd })
      else if (x.kind === 'spoke') e.tags.push({ kind: 'spoke' })
      else e.tags.push({ kind: x.kind, along: fwd, side: sideOf[n] })
    } })
  // half-edges: two per edge; `out` per vertex sorted counter-clockwise
  const H = [], out = new Map()
  for (const e of edges.values()) {
    const h0 = { from: e.a, to: e.b, e, fwd: true }, h1 = { from: e.b, to: e.a, e, fwd: false }; h0.twin = h1; h1.twin = h0
    H.push(h0, h1)
    for (const h of [h0, h1]) { const k = key(h.from); (out.get(k) || out.set(k, []).get(k)).push(h) } }
  for (const L of out.values()) { L.forEach(h => { h.ang = Math.atan2(h.to[1] - h.from[1], h.to[0] - h.from[0]) }); L.sort((p, q) => p.ang - q.ang); L.forEach((h, i) => { h.at = i }) }
  // next(h): at h's head, the outgoing half-edge just CLOCKWISE of h's twin — the walk keeps the face on its left
  const next = (h) => { const L = out.get(key(h.to)), i = h.twin.at; return L[(i - 1 + L.length) % L.length] }
  // ── the cycles, and what lies on their left ──
  const cycles = []
  for (const h of H) { if (h.cyc != null) continue
    const c = { hs: [], n: cycles.length }
    for (let g = h, guard = 0; g.cyc == null; g = next(g)) { if (++guard > 1e7) throw new Error(`[${who}][absorb] ⛔ a face walk did not close. Refusing.`); g.cyc = c.n; c.hs.push(g) }
    cycles.push(c) }
  const cycArea = (c) => c.area ??= c.hs.reduce((t, h) => t + h.from[0] * h.to[1] - h.to[0] * h.from[1], 0)
  const leftOf = (h, t) => { const along = t.along === h.fwd       // this half-edge runs the input's way
    return t.kind === 'ink' ? (along === inkOnLeft) : (along === (t.side > 0)) }
  // ⭐ A FACE IS ITS OUTER CYCLE AND THE HOLE CYCLES IT HOLDS. A block's ink outline never touches a centreline (it sits ε off
  // it), so in the walk every block is a separate cycle — a HOLE of the cell around it — and the cell's own outer cycle is all
  // centreline. So typing and naming read a FACE (every cycle of it), never one cycle. Each hole (a clockwise cycle) joins the
  // smallest counter-clockwise cycle enclosing a point just off its own edge (the standard hole-to-face link of a face walk;
  // geometry only joins a face's boundaries, it never names one); a hole no cycle encloses belongs to the unbounded face.
  const pos = cycles.filter(c => cycArea(c) > 0), neg = cycles.filter(c => cycArea(c) < 0)
  const F = pos.map(c => ({ cycles: [c] })), unbounded = { cycles: [] }
  pos.forEach((c, n) => { c.face = F[n]; let a = Infinity, b = Infinity, x = -Infinity, y = -Infinity
    for (const h of c.hs) { if (h.from[0] < a) a = h.from[0]; if (h.from[1] < b) b = h.from[1]; if (h.from[0] > x) x = h.from[0]; if (h.from[1] > y) y = h.from[1] }
    c.bb = [a, b, x, y] })
  { const G = 2e5, grid = new Map()   // 200 m cells over the counter-clockwise cycles' bounds
    pos.forEach((c, n) => { for (let gx = Math.floor(c.bb[0] / G); gx <= Math.floor(c.bb[2] / G); gx++) for (let gy = Math.floor(c.bb[1] / G); gy <= Math.floor(c.bb[3] / G); gy++) (grid.get(gx + ',' + gy) || grid.set(gx + ',' + gy, []).get(gx + ',' + gy)).push(n) })
    const inPoly = (pt, c) => { let w = false; const hs = c.hs; for (const h of hs) { const [xi, yi] = h.to, [xj, yj] = h.from; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) w = !w } return w }
    for (const N of neg) {
      // the longest edge of the cycle with its antennas removed: a spur's edge is walked both ways in one cycle (its twin is
      // in it too), and a point off it lies on the spur, not in the face the hole bounds
      const pt = holeProbe(N.hs, who)
      let best = null
      for (const n of (grid.get(Math.floor(pt[0] / G) + ',' + Math.floor(pt[1] / G)) || [])) { const P = pos[n]
        if (pt[0] < P.bb[0] || pt[0] > P.bb[2] || pt[1] < P.bb[1] || pt[1] > P.bb[3] || !(cycArea(P) < (best ? cycArea(best) : Infinity))) continue
        if (inPoly(pt, P)) best = P }
      N.face = best ? best.face : unbounded; N.face.cycles.push(N) } }
  const allFaces = [...F, unbounded]
  for (const f of allFaces) {
    let ink = null, water = false, frameIn = null, flags = false
    for (const c of f.cycles) for (const h of c.hs) { if (h.e.tags.some(t => t.kind === 'cl' || t.kind === 'spoke')) continue   // a centreline or a spoke: ink on both sides, says nothing
      for (const t of h.e.tags) { flags = true; const L = leftOf(h, t)
        if (t.kind === 'ink') { if (ink === null) ink = L; else if (ink !== L) {
          if (diag) diag.bothInk = f.cycles.flatMap(c => c.hs.flatMap(g => g.e.tags.filter(u => u.kind === 'ink').map(u => ({ at: g.from.map(v => v / CLIP_SCALE), to: g.to.map(v => v / CLIP_SCALE), label: u.label, ring: u.ring, inkLeft: leftOf(g, u), cycle: g.cyc }))))
          throw new Error(`[${who}][absorb] ⛔ a face at (${h.from.map(v => v / CLIP_SCALE)}) is both ink and not ink by its own edges. Refusing.`) } }
        else if (t.kind === 'water') { if (L) water = true }
        else if (t.kind === 'frame') frameIn = L } }
    f.type = (ink === true || (ink === null && !flags)) ? 'cell' : water ? 'water' : (frameIn === false || f === unbounded) ? 'outside' : 'land'
  }
  // ── a land face is named by its ink edges' labels ──
  // ⭐ A LABEL MAY BORDER MORE THAN ONE FACE: where a road crosses another with no node (grade separation, §5a's true-geometry
  // crossing), one ① edge is cut by the other's ink into pieces on faces either side. So a label names the SET of faces it
  // borders, and a land face is the one face common to all of its labels — never the first face a label was seen on.
  const facesOfLabel = new Map()
  faces.forEach((f, k) => { if (!f) return; for (const L of [f.labels, ...(f.holeLabels || [])]) for (const l of (L || [])) if (l != null) (facesOfLabel.get(l) || facesOfLabel.set(l, new Set()).get(l)).add(k) })
  const census = { cells: 0, joined: 0, toWater: 0, zero: [], two: [], outside: 0, landUnnamed: 0, landTwoNames: [], mixed: [] }
  // ⭐ where the mint REFUSED a node's outline (acute · degenerate · noVertex) it drew no spokes, so a cell there may span two
  // strokes: a refusal at such a cell says so, so it is read as the outline's, never as an absorb defect (Zob, 2026-10-25)
  const refusedAt = new Map(outlineRefused.map(r => [Math.round(rl(r.p[0]) * CLIP_SCALE) + ',' + Math.round(rl(r.p[1]) * CLIP_SCALE), r.why]))
  const refusedNote = (f) => { for (const c of f.cycles) for (const h of c.hs) { const w = refusedAt.get(key(h.from)); if (w) return ` (outline refused here: ${w})` } return '' }
  const at0 = (f) => { const h = f.cycles[0]?.hs[0]; return h ? `(${h.from.map(v => (v / CLIP_SCALE).toFixed(3)).join(', ')})${refusedNote(f)}` : '(?)' }
  for (const f of allFaces) {
    if (f.type === 'water') { f.group = 'water'; continue }
    if (f.type === 'outside') { f.group = 'none'; continue }
    if (f.type !== 'land') continue
    let ks = null
    for (const c of f.cycles) for (const h of c.hs) for (const t of h.e.tags) { if (t.kind !== 'ink' || t.label == null || !facesOfLabel.has(t.label)) continue
      const S = facesOfLabel.get(t.label); ks = ks ? new Set([...ks].filter(k => S.has(k))) : new Set(S) }
    ks ||= new Set()
    if (ks.size === 1) f.group = [...ks][0]
    else if (!ks.size) { f.group = 'none'; census.landUnnamed++
      if (diag) (diag.unnamed ||= []).push({ at: at0(f), cycles: f.cycles.length, area: f.cycles.reduce((t, c) => t + cycArea(c), 0) / 2 / CLIP_SCALE / CLIP_SCALE,
        labels: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink').map(t => t.label))))].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null, faces: [...(facesOfLabel.get(l) || [])] })),
        tags: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.map(t => t.kind))))] }) }
    else { f.group = 'none'; census.landTwoNames.push(`${[...ks].join('+')}@${at0(f)}`) } }
  // ── 3. every cell joins the one group across its ink edges ──
  const fr = frame.map(q => [rl(q[0]) * CLIP_SCALE, rl(q[1]) * CLIP_SCALE]), fx0 = Math.min(...fr.map(p => p[0])), fx1 = Math.max(...fr.map(p => p[0])), fz0 = Math.min(...fr.map(p => p[1])), fz1 = Math.max(...fr.map(p => p[1]))
  const inFrame = (f) => f.cycles.every(c => c.hs.every(h => h.from[0] >= fx0 && h.from[0] <= fx1 && h.from[1] >= fz0 && h.from[1] <= fz1))
  const faceOfH = (h) => cycles[h.cyc].face
  for (const f of allFaces) {
    if (f.type !== 'cell') continue
    census.cells++
    const gs = new Set()
    for (const c of f.cycles) for (const h of c.hs) if (h.e.tags.some(t => t.kind === 'ink') && !h.e.tags.some(t => t.kind === 'cl' || t.kind === 'spoke')) { const g = faceOfH(h.twin).group; if (g != null && g !== 'none') gs.add(g) }
    if (gs.size === 1) { f.group = [...gs][0]; census.joined++; if (f.group === 'water') census.toWater++ }
    else if (!gs.size) { f.group = 'none'; if (inFrame(f)) census.zero.push(at0(f)); else census.outside++ }
    else { f.group = 'none'; census.two.push(`${[...gs].join('+')}@${at0(f)}`)
      if (diag) (diag.two ||= []).push({ at: at0(f), groups: [...gs], area: f.cycles.reduce((t, c) => t + cycArea(c), 0) / 2 / CLIP_SCALE / CLIP_SCALE,
        labels: [...new Set(f.cycles.flatMap(c => c.hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink').map(t => t.label))))].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null })) }) }
  }
  for (const c of cycles) c.group = c.face.group ?? null
  const print = `[${who}][absorb] the ink cut by its centrelines: ${census.cells} cell(s) · ${census.joined} joined ONE face (${census.toWater} the water) · ${census.zero.length} touch none · ${census.two.length} touch two · ${census.outside} beyond the frame · land faces with no ① label ${census.landUnnamed}${census.landTwoNames.length ? ` · ⛔ ${census.landTwoNames.length} land face(s) named by two faces' labels` : ''}`
  console.log(`    ${print}`)
  if (census.zero.length || census.two.length || census.landTwoNames.length) throw new Error(`${print} — ⛔ a cell must touch exactly one face: ${[...census.zero.map(a => 'none ' + a), ...census.two.map(a => 'two ' + a), ...census.landTwoNames.map(a => 'land ' + a)].slice(0, 8).join(' · ')}. Refusing.`)
  // ── 4. the splice: each face's boundary, read off the arrangement ──
  const groupOf = (h) => cycles[h.cyc].group
  const labelOf = (h) => {   // the label of the boundary edge h, the face on its LEFT
    const cl = h.e.tags.find(t => t.kind === 'cl')
    if (cl) { const C = centrelines[cl.rec], along = cl.along === h.fwd   // h runs the stroke's way: the face is on its left
      return along ? (C.ownL?.[cl.seg] ?? null) : (C.own?.[cl.seg] ?? null) }
    if (h.e.tags.some(t => t.kind === 'frame')) return frameOwner
    const ink = h.e.tags.find(t => t.kind === 'ink'); if (ink) return ink.label
    if (h.e.tags.some(t => t.kind === 'water')) return waterOwner
    return null }
  const bound = new Map()   // group → boundary half-edges
  for (const h of H) { const g = groupOf(h); if (g == null || g === 'none' || g === 'water' || groupOf(h.twin) === g) continue; (bound.get(g) || bound.set(g, []).get(g)).push(h) }
  let unlabelled = 0
  const paint = faces.map(() => null)
  for (const [g, hs] of bound) {
    const isB = (h) => groupOf(h) === g && groupOf(h.twin) !== g, seen = new Set(), rings = []
    for (const h0 of hs) { if (seen.has(h0)) continue
      const pts = [], labs = []
      for (let h = h0, guard = 0; !seen.has(h); ) { if (++guard > 1e7) throw new Error(`[${who}][absorb] ⛔ face ${g}'s boundary did not close. Refusing.`)
        seen.add(h); pts.push([h.from[0] / CLIP_SCALE, h.from[1] / CLIP_SCALE]); const l = labelOf(h); if (l == null) unlabelled++; labs.push(l)
        // rotate clockwise from h's twin at its head to the next boundary half-edge of this face
        const L = out.get(key(h.to)); let i = h.twin.at, nx = null
        for (let s = 1; s <= L.length; s++) { const c = L[(i - s + L.length) % L.length]; if (isB(c)) { nx = c; break } }
        if (!nx) throw new Error(`[${who}][absorb] ⛔ face ${g}'s boundary stops at (${h.to.map(v => v / CLIP_SCALE)}). Refusing.`)
        h = nx }
      rings.push({ pts, labs, a: area2(pts) }) }
    const outers = rings.filter(r => r.a > 0)
    if (outers.length !== 1) throw new Error(`[${who}][absorb] ⛔ face ${g} absorbs into ${outers.length} outer boundaries (want 1). Refusing.`)
    // the block convention (`blocks` wound as ①'s holes): the outer negative, a hole positive, labels rotated with a reversal
    const flip = (r) => { const p = [...r.pts].reverse(), l = [...r.labs].reverse(); l.push(l.shift()); return { p, l } }
    const o = flip(outers[0]), H2 = rings.filter(r => r.a < 0).map(flip)
    paint[g] = { outer: o.p, outerLabels: o.l, holes: H2.map(x => x.p), holeLabels: H2.map(x => x.l) }
  }
  const unpainted = faces.map((f, k) => f && !paint[k] ? k : null).filter(k => k != null)
  if (diag && unpainted.length) diag.unpainted = unpainted.map(k => ({ k, labels: [...new Set([...(faces[k].labels || []), ...(faces[k].holeLabels || []).flat()])].map(l => ({ l, owner: owners[l] ? `${owners[l].skelId}/${owners[l].side}/${owners[l].segOrd}` : null, faces: [...(facesOfLabel.get(l) || [])] })) }))
  if (unpainted.length) throw new Error(`[${who}][absorb] ⛔ ${unpainted.length} face(s) came out of the arrangement with no boundary (e.g. ${unpainted.slice(0, 6).join(', ')}). Refusing.`)
  if (unlabelled) throw new Error(`[${who}][absorb] ⛔ ${unlabelled} painted edge(s) carry no label — an edge whose owner the splice could not read. Refusing.`)
  // ── the cells the ground paints apart from the road: water and grade-separated owners ──
  const cells = []
  const ringOf = (c) => { const ring = []   // a cycle as a polygon: its spur antennas (an exact retrace) removed
    for (const h of c.hs) { const p = [h.from[0] / CLIP_SCALE, h.from[1] / CLIP_SCALE]
      if (ring.length >= 2 && ring[ring.length - 2][0] === p[0] && ring[ring.length - 2][1] === p[1]) ring.pop(); else ring.push(p) }
    while (ring.length >= 3 && ring[0][0] === ring[ring.length - 2][0] && ring[0][1] === ring[ring.length - 2][1]) { ring.pop(); ring.shift() }
    return ring.length >= 3 && area2(ring) !== 0 ? ring : null }
  // the three classes the ground paints apart: water (the shore) · a grade-separated HIGHWAY (left to H) · road. ⛔ A street's
  // own bridge is road (Boz, 2026-10-25): `hwy` is stamped by the mint on a highway's owners only, never `gradeSeparated`.
  const classOfLabel = (l) => owners[l]?.water ? 'water' : owners[l]?.hwy ? 'hwy' : 'road'
  const classOfH = (h) => { const ink = h.e.tags.find(t => t.kind === 'ink' && t.label != null); if (ink && !h.e.tags.some(t => t.kind === 'cl')) return classOfLabel(ink.label)
    const cl = h.e.tags.find(t => t.kind === 'cl'); if (cl) { const l = centrelines[cl.rec]?.own?.[cl.seg]; return l != null ? classOfLabel(l) : null }
    return null }
  const inkLabelsOf = (hs) => [...new Set(hs.flatMap(h => h.e.tags.filter(t => t.kind === 'ink' && t.label != null).map(t => t.label)))]
  const pieceRing = (hs) => ringOf({ hs })
  for (const f of allFaces) { if (f.type !== 'cell' || f.group == null || f.group === 'none') continue
    const labels = [...new Set(f.cycles.flatMap(c => inkLabelsOf(c.hs)))]
    if (!labels.some(l => owners[l]?.water || owners[l]?.hwy)) continue
    const kinds = new Set(labels.map(classOfLabel))
    if (kinds.size === 1) { const rings = f.cycles.map(ringOf).filter(Boolean); if (rings.length) cells.push({ rings, labels, group: f.group }); continue }
    // ⭐ A CELL AT A CROSSING WITH NO NODE (a grade separation, a street over the coast) has no outline point, so no spoke split it:
    // its boundary runs one class, then the other. It changes class at exactly TWO of its own vertices — where the centrelines
    // cross, and where the two strokes' ink edges meet — and the chord between them splits it, one piece per class: topology,
    // no new vertex, no search. ⛔ A cell that cannot be split so (an odd pairing, or a hole) REFUSES by name and place, as a
    // cell touching zero or two faces does (Boz, 2026-10-25: no precedence fallback).
    const hs = f.cycles.length === 1 ? f.cycles[0].hs : null
    let split = false
    if (hs) {
      const cls = hs.map(classOfH), n = hs.length
      for (let k = 0, last = null; k < 2 * n; k++) { const c = cls[k % n]; if (c != null) last = c; else if (last != null && k >= n) cls[k % n] = last }
      for (let k = 0, last = null; k < 2 * n; k++) { const c = cls[k % n]; if (c != null) last = c; else if (last != null) cls[k % n] = last }
      const T = []; for (let k = 0; k < n; k++) if (cls[k] != null && cls[(k - 1 + n) % n] != null && cls[k] !== cls[(k - 1 + n) % n]) T.push(k)
      // the transitions pair across the band: walking the cycle, its centreline side meets them in one order (X1, X2, …) and
      // its ink side in the reverse (…, c2, c1), so the j-th centreline-side transition faces the j-th from the END of the ink side
      const onCl = (k) => hs[k].e.tags.some(t => t.kind === 'cl'), X = T.filter(onCl), C = T.filter(k => !onCl(k))
      if (T.length >= 2 && X.length === C.length) {
        // rotate the ink-side list so it follows the centreline side in cycle order, then pair end to end
        const after = (k, from) => (k - from + n) % n, x0 = X[0]
        X.sort((p, q) => after(p, x0) - after(q, x0)); C.sort((p, q) => after(p, x0) - after(q, x0))
        const chords = X.map((x, q) => [x, C[C.length - 1 - q]])
        let pieces = [hs.map((_, k) => k)]
        for (const [a, b] of chords) { const P = pieces.find(p => p.includes(a) && p.includes(b)); if (!P) { pieces = null; break }
          const ia = P.indexOf(a), ib = P.indexOf(b), lo = Math.min(ia, ib), hi = Math.max(ia, ib)
          pieces.splice(pieces.indexOf(P), 1, P.slice(lo, hi), [...P.slice(hi), ...P.slice(0, lo)]) }
        const rings = pieces && pieces.map(P => pieceRing(P.map(k => hs[k])))
        if (rings && rings.every(Boolean)) { split = true
          pieces.forEach((P, q) => { const L = inkLabelsOf(P.map(k => hs[k])); if (L.some(l => owners[l]?.water || owners[l]?.hwy)) cells.push({ rings: [rings[q]], labels: L, group: f.group }) }) }
      }
    }
    if (!split) census.mixed.push(`${[...kinds].join('+')}@${at0(f)}`)
  }
  if (census.mixed.length) throw new Error(`[${who}][absorb] ⛔ ${census.mixed.length} cell(s) hold two classes of owner and cannot be split at their class changes (an odd pairing, or a hole): ${census.mixed.slice(0, 8).join(' · ')}${census.mixed.length > 8 ? ' …' : ''}. Refusing.`)
  return { paint, cells, census }
}
