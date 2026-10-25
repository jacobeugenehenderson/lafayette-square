#!/usr/bin/env node
// CLAIM — A CELL ROUND A FACE NO SPOKE REACHED SPLITS AT ITS OWN CLASS CHANGES, PAIRED BY OWNER, OR REFUSES.
//
// When every corner of a face is a node-less meeting (highway ramps and streets crossing without a shared vertex; a breakwater
// meeting the coast), the mint draws no spoke to it, and the ink round it is one cell — an ANNULUS — holding two classes
// (BRIEF-the-ink-is-owned-by-its-labels; the probe of 2026-10-25 found 26: LS 10, HPDM 13, Huron 2, PTown 1).
// `src/lib/absorbInk.js#splitAnnulus` (Boz's ruling with Zob's read): each class change carries the OWNER PAIR meeting there;
// an outer change pairs with the hole change of the same pair; only a pair occurring more than once tries its matchings, and
// exactly one must be simple; the chords are verified in exact integers. Planted rows, read off the function itself:
//   (a) IDENTITY: three strokes round a square hole — three distinct pairs, matched by identity, three pieces, one class each.
//   (b) A DOUBLED PAIR RESOLVED BY ROTATION: two strokes alternating round the square — one pair four times; of its matchings
//       exactly one gives simple chords (the corner-to-corner), so it splits into four pieces.
//   (c) A THICK RING WHOSE CLASSES REPEAT MUST REFUSE: an octagon ring, four alternating runs on each cycle, the hole's turned a
//       quarter against the outer's — two spiral matchings are each simple with one class per piece, so neither is the cell's
//       own (Zob's case).
//   ⭐ A matching passes only if its chords are simple AND each piece holds one class: in a ring a rotation can spiral, simple
//       but mixing classes, which (b) shows (its rotations' simple spirals are refused for mixing).
//   (d) MISMATCHED class changes (three on the outer, one on the hole) refuse.
//   MUTANT (always run): (a) with its hole's water owned by another stroke must refuse BY IDENTITY (no outer change has that pair).
//   node checks/claims-an-annulus-splits-at-its-own-class-changes.mjs
import { splitAnnulus } from '../src/lib/absorbInk.js'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const area2 = (pts) => pts.reduce((t, p, i) => { const q = pts[(i + 1) % pts.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0)
// a cycle from points (units) and per-edge [class, owner]; `ccw` the winding it must take (the cell on its left)
function cycle(pts, tags, ccw) {
  let P = pts, T = tags
  if ((area2(P) > 0) !== ccw) { P = [...pts].reverse(); T = [...tags].reverse(); T.push(T.shift()) }   // edge k → k+1 keeps its tag
  return P.map((p, k) => ({ from: p, to: P[(k + 1) % P.length], cls: T[k][0], own: T[k][1] }))
}
const cls = (e) => e.cls ?? null, own = (e) => e.own ?? null
const classesOf = (piece) => [...new Set(piece.filter(e => !e.chord).map(e => e.cls).filter(Boolean))]

// (a) a 100-unit square outer, a 20-unit square hole; bottom = hwy H, right = road R, top + left = water S
{ const O = cycle([[0, 0], [100, 0], [100, 100], [0, 100]], [['hwy', 'H'], ['road', 'R'], ['water', 'S'], ['water', 'S']], true)
  const Hh = cycle([[40, 40], [40, 60], [60, 60], [60, 40]], [['water', 'S'], ['water', 'S'], ['road', 'R'], ['hwy', 'H']], false)
  const r = splitAnnulus(O, Hh, cls, own)
  row(!!r.pieces && r.pieces.length === 3 && r.pieces.every(p => classesOf(p).length === 1),
    `(a) identity: three owner pairs, matched by identity → ${r.pieces ? `${r.pieces.length} pieces, classes ${r.pieces.map(p => classesOf(p).join('+')).join(' · ')}` : 'REFUSED ' + r.refused}`)
  // mutant: the hole's water edges owned by ANOTHER stroke (T, its classes kept), so two of its changes carry pairs the outer
  // has none of — matched by identity they cannot pair, whatever the geometry
  const Hm = Hh.map(e => ({ ...e, own: e.own === 'S' ? 'T' : e.own }))
  const m = splitAnnulus(O, Hm, cls, own)
  row(!!m.refused && /owner pair/.test(m.refused), `mutant (a): the hole's water owned by another stroke → ${m.refused ? 'REFUSED (' + m.refused + ')' : 'it split — the pairing is by position, not identity'}`) }

// (b) two strokes alternating round the square: H on bottom and top, R on the sides — one pair, four times
{ const O = cycle([[0, 0], [100, 0], [100, 100], [0, 100]], [['hwy', 'H'], ['road', 'R'], ['hwy', 'H'], ['road', 'R']], true)
  const Hh = cycle([[40, 40], [60, 40], [60, 60], [40, 60]], [['hwy', 'H'], ['road', 'R'], ['hwy', 'H'], ['road', 'R']], false)
  const r = splitAnnulus(O, Hh, cls, own)
  row(!!r.pieces && r.pieces.length === 4 && r.pieces.every(p => classesOf(p).length === 1),
    `(b) a doubled pair resolved by rotation → ${r.pieces ? `${r.pieces.length} pieces, classes ${r.pieces.map(p => classesOf(p).join('+')).join(' · ')}` : 'REFUSED ' + r.refused}`) }

// (c) a THICK RING WHOSE CLASSES REPEAT, its hole's runs turned a quarter against the outer's: an octagon (radius 1000 units) round
// an octagon hole (radius 10), four alternating class runs on each, the hole's shifted by one run. Every one-class matching is a
// spiral, and the spirals either way are BOTH simple — two matchings pass, neither is the cell's own: REFUSE. (Found by search:
// with the runs aligned, a convex ring's straight chords admit one; the turned runs are Zob's ambiguous case.)
{ const ngon = (n, r, ph) => [...Array(n).keys()].map(i => [Math.round(r * Math.cos(ph + 2 * Math.PI * i / n)), Math.round(r * Math.sin(ph + 2 * Math.PI * i / n))])
  const runs = (n, shift) => [...Array(n).keys()].map(i => (Math.floor(((i + shift) % n) / (n / 4)) % 2 ? ['road', 'R'] : ['hwy', 'H']))
  const O = cycle(ngon(8, 1000, 0), runs(8, 0), true), Hh = cycle(ngon(8, 10, 0.1), runs(8, 2), false)
  const r = splitAnnulus(O, Hh, cls, own)
  row(!!r.refused && /^[2-9] of/.test(r.refused), `(c) a thick ring whose classes repeat, its hole's runs turned → ${r.refused ? 'REFUSED (' + r.refused + ')' : `it split into ${r.pieces.length} — a choice the cell does not make was made`}`) }

// (d) mismatched: three changes on the outer, one pair on the hole
{ const O = cycle([[0, 0], [100, 0], [100, 100], [0, 100]], [['hwy', 'H'], ['road', 'R'], ['water', 'S'], ['water', 'S']], true)
  const Hh = cycle([[40, 40], [40, 60], [60, 60], [60, 40]], [['water', 'S'], ['water', 'S'], ['water', 'S'], ['hwy', 'H']], false)
  const r = splitAnnulus(O, Hh, cls, own)
  row(!!r.refused, `(d) mismatched class changes → ${r.refused ? 'REFUSED (' + r.refused + ')' : 'it split'}`) }

console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ an annulus splits at its own class changes, paired by owner, or refuses')
process.exit(red ? 1 : 0)
