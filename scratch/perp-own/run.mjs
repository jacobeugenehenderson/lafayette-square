// run.mjs <scene> [--live-norm] — read-only; run from the worktree root (the feed reads cwd-relative paths), authoring
// loaded via the worktree's own feed().
//  (1) the producer's census: refusedPerp / refusedPerpM2 summed over tiles (and refused / refusedM2 for scale)
//  (2) per leg extension (its painted walk, ext ∩ walk): area inside walk cells of the OTHER leg's span, of its OWN span,
//      of any third span, and in no cell. Summed PER EXTENSION, so where two legs' extensions overlap it counts twice.
//  (a) each leg's span label, by construction (`spanOfSrc(p.si, i)` of the edge `legExt` was struck from), by role
//      (before = the edge arriving at the arc, after = the edge leaving it): run / the corner's OWN arc / another arc / cap,
//      against `iaArc` read per vertex (the edge's start and end vertex) and whether the edge is an arc edge (both ends in one arc)
//  (b) the walk cut's own decomposition of the extensions' ground, as the union (no double count): held by a cell · outside
//      the disc (`inBlock`) · each `byRects` face kind · left (refused) — and the refused ground that is a cut, not an extension
import { fileURLToPath } from 'url'
const WT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const scene = process.argv[2], liveNorm = process.argv.includes('--live-norm')
const { feed } = await import(`${WT}/scratch/_proto-feed.mjs`)
const { buildTileGround } = await import('./tileGround.probe.mjs')
const ar = (rs, sa) => rs.reduce((t, r) => t + sa(r), 0)   // signed sum: holes subtract
const E = [], B = { held: 0, notHeld: 0, inDisc: 0, faces: {}, left: 0, leftRamp: 0, tiles: 0 }
let cur = null
globalThis.__MEASURE = (ext, ramps, cells, walk, { intersectRings, unionRings, differenceRings, signedArea }) => {
  const A = (rs) => Math.abs(ar(rs, signedArea))
  cur = ext.length ? { U: unionRings(ext.map(x => x.ring)), ramps } : null
  for (const x of ext) {
    const lab = { role: x.role, span: x.span, cArc: x.cArc, vS: x.vS, vE: x.vE, edgeInArc: x.edgeInArc, cap: x.cap, stampLeg: x.stampLeg, stampArc: x.stampArc }
    const g = intersectRings([x.ring], walk); const tot = A(g); if (!(tot > 0)) { E.push({ ...lab, tot: 0, other: 0, own: 0, third: 0, none: 0 }); continue }
    const by = (pred) => { const R = cells.filter(c => pred(c.span)).flatMap(c => c.reg); return R.length ? A(intersectRings(g, unionRings(R))) : 0 }
    const all = cells.flatMap(c => c.reg), inAny = all.length ? A(intersectRings(g, unionRings(all))) : 0
    E.push({ ...lab, otherSpan: x.other, at: x.at, tot, other: by(s => s === x.other), own: by(s => s === x.span), third: by(s => s !== x.span && s !== x.other), none: tot - inAny })
  }
}
let ops = null
globalThis.__CUT0 = ({ cls, B: Bd, held, L, intersectRings, unionRings, differenceRings, signedArea }) => {
  if (cls !== 'walk' || !cur) return
  const A = (rs) => Math.abs(ar(rs, signedArea)); ops = { intersectRings, unionRings, differenceRings, A }
  const X = intersectRings(cur.U, Bd), H = held.length ? unionRings(held) : []
  B.tiles++; B.held += H.length ? A(intersectRings(X, H)) : 0
  const nh = H.length ? differenceRings(X, H) : X; B.notHeld += A(nh); B.inDisc += L.length ? A(intersectRings(nh, L)) : 0
}
globalThis.__CUT1 = ({ cls, faces, left }) => {
  if (cls !== 'walk' || !cur || !ops) return
  const { intersectRings, differenceRings, A } = ops
  for (const f of faces) { const a = A(intersectRings(f.rings, cur.U)); if (a > 0) B.faces[f.why] = (B.faces[f.why] || 0) + a }
  if (left.length) { B.left += A(intersectRings(left, cur.U)); if (cur.ramps.length) B.leftRamp += A(intersectRings(differenceRings(left, cur.U), cur.ramps)) }
  cur = null
}
const f = feed(scene); if (!f) process.exit(2)
if (liveNorm) {   // the norm as derive resolves it today, in place of the frozen one
  const { resolveCurbCutNorm } = await import(`${WT}/cartograph/curb-cut-norm.mjs`)
  const was = f.ribbons.curbCutNorm, now = resolveCurbCutNorm(scene)
  console.log(`norm: frozen ${JSON.stringify(was)} → live ${JSON.stringify(now)}`); f.ribbons.curbCutNorm = now
}
const prev = console.log, pw = console.warn; console.log = () => {}; console.warn = () => {}
let R; try {
  R = buildTileGround(f.ribbons, { smooth: 0, stencil: f.stencil, curbWidth: f.curbWidth, curbedMinWidth: f.curbedMinWidth,
    blockCustoms: f.blockCustoms, blockLandUse: f.blockLandUse, cornerCornerRadiusOverrides: f.cornerCornerRadiusOverrides,
    cornerRadiusOverrides: f.cornerRadiusOverrides, cornerRadiusScale: f.cornerRadiusScale ?? 1 })
} finally { console.log = prev; console.warn = pw }
const T = R.protoBandPieces || []
const S = { refused: 0, refusedM2: 0, refusedPerp: 0, refusedPerpM2: 0 }
for (const t of T) for (const k of Object.keys(S)) S[k] += t.census?.[k] || 0
const m = (v) => v.toFixed(2)
console.log(`${scene} · authoring slots ${f.slots} · tiles with pieces ${T.length}`)
console.log(`(1) refused ${S.refused} region(s) ${S.refusedM2.toFixed(3)} m² · of them refusedPerp ${S.refusedPerp} region(s) ${S.refusedPerpM2.toFixed(3)} m²`)
const pos = E.filter(e => e.tot > 0), sum = (a, k) => a.reduce((t, e) => t + e[k], 0)
console.log(`(2) leg extensions ${E.length} (with painted walk ${pos.length}) · painted ${m(sum(pos, 'tot'))} m²: own-leg cells ${m(sum(pos, 'own'))} · OTHER leg's cells ${m(sum(pos, 'other'))} · third span's ${m(sum(pos, 'third'))} · no cell ${m(sum(pos, 'none'))} (per-extension sum)`)
// (a)
const kind = (e) => e.span[0] === 'r' ? 'run' : e.span[0] === 'c' ? 'cap' : e.span[0] === 'a' ? (+e.span.slice(1).split('/')[0] === e.cArc ? 'own arc' : 'other arc') : e.span
const tab = {}; for (const e of E) { const k = `${e.role} · ${kind(e)} · edge ${e.edgeInArc ? 'IS an arc edge' : 'not an arc edge'} · start vertex ${e.vS == null ? 'unlabelled' : e.vS === e.cArc ? 'corner arc' : 'other arc'} · end vertex ${e.vE == null ? 'unlabelled' : e.vE === e.cArc ? 'corner arc' : 'other arc'}`; tab[k] = (tab[k] || 0) + 1 }
console.log(`(a) legs by span label:`); for (const [k, v] of Object.entries(tab).sort((a, b) => b[1] - a[1])) console.log(`      ${v} · ${k}`)
const sameStamp = E.filter(e => e.stampLeg != null && e.stampLeg === e.stampArc).length
console.log(`    legs whose stamp run equals the arc's first edge's: ${sameStamp} of ${E.length}`)
// (b)
const fsum = Object.values(B.faces).reduce((t, v) => t + v, 0)
console.log(`(b) extensions' walk ground as ONE union, in the walk cut (${B.tiles} tiles): held by a cell ${m(B.held)} · not held ${m(B.notHeld)} = outside the disc ${m(B.notHeld - B.inDisc)} + in the disc ${m(B.inDisc)}`)
console.log(`    of in the disc: byRects faces ${m(fsum)} [${Object.entries(B.faces).map(([k, v]) => `${k} ${m(v)}`).join(' · ')}] · left (refused) ${m(B.left)} · unaccounted ${m(B.inDisc - fsum - B.left)}`)
console.log(`    refused ground that is a cut, not an extension: ${m(B.leftRamp)} · ⇒ refusedPerp reconstructed ${m(B.left + B.leftRamp)} vs census ${m(S.refusedPerpM2)}`)
console.log(`    peak rss ${(process.memoryUsage().rss / 1e9).toFixed(2)} GB`)
