#!/usr/bin/env node
// CLAIM — THE FACES OF A NODED ARRANGEMENT ARE WALKED ONCE, EXACTLY, AND EVERY VERTEX OUT IS A NODED VERTEX.
// src/lib/latticeFaces.js#facesOf is the arrangement's other half (Zob's ruling (ii), 2026-10-28; BRIEF-cut-once-in-full-precision):
// it replaced clipper's union on noded input, which emitted vertices no noding made (Huron: 621; scratch/cut-once/step0.mjs).
// latticeNode.js's `self` option (Zob's ruling (1)) and lineCrossOf / sameLine (ruling (2)) are its inputs' and cuts' homes.
// ASSERTS, file only, on planted rows:
//   (a) a square with a hole → two rings, the hole wound negative · (b) two squares touching at one corner (a PINCH) → two
//   rings meeting there · (c) two squares sharing an edge drawn opposite ways → the shared edge CANCELS, one ring · (d) three
//   sets overlapping, kept where all three are → their common square · (e) refusals by name: a T, a proper crossing, an open
//   chain (a face reached with two windings) · (f) the books: every row's rings' exact area equals its kept faces' (facesOf
//   refuses otherwise; a row that ran is that proof) · (g) lineCrossOf: a crossing past both segments, exact, half-up;
//   parallel lines refuse by name; sameLine exact · (h) `self`: a ring crossing itself is noded; tjoin with self refuses;
//   verifyNoded with self refuses a planted self-crossing output, and nodeCrossings passes `self` to it (read)
// MUTANTS (always run, the source read and rewritten, never a copy): the angle sort in doubles (angleCmp on a pair whose cross
// product is −1 near 10^16) · a merged edge keeping only its LAST multiplicity (row (c) must change) · the boundary walk turning
// counter-clockwise (the books or row (b) must break) · the caller's keep at ≥ 0 (row (a) must change). Each must go RED.
//   node checks/claims-the-faces-are-walked-once.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { facesOf, angleCmp } from '../src/lib/latticeFaces.js'
import { nodeCrossings, verifyNoded, lineCrossOf, sameLine } from '../src/lib/latticeNode.js'

const HERE = fileURLToPath(new URL('.', import.meta.url)), FACES = join(HERE, '../src/lib/latticeFaces.js'), NODE = join(HERE, '../src/lib/latticeNode.js')
let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const ring = (pts, set = 0) => pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length], set }))
const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
const area2 = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p.X * q.Y - q.X * p.Y }, 0)
const sig = (F) => F.rings.map(r => area2(r)).sort((x, y) => x - y).join(',')
const tryF = (f) => { try { return { F: f() } } catch (e) { return { err: e.message } } }
// the planted rows, run by a given facesOf (the live one, or a mutant)
const ROWS = {
  hole: (fo, keep = w => w[0] > 0) => fo([...ring(sq(0, 0, 10)), ...ring(sq(3, 3, 4).reverse())], keep, { sets: 1, who: 'check (a)' }),
  pinch: (fo) => fo([...ring(sq(0, 0, 2)), ...ring(sq(2, 2, 2))], w => w[0] > 0, { sets: 1, who: 'check (b)' }),
  cancel: (fo) => fo([...ring([[0, 0], [2, 0], [2, 2], [0, 2]]), ...ring([[2, 0], [4, 0], [4, 2], [2, 2]])], w => w[0] > 0, { sets: 1, who: 'check (c)' }),
  three: (fo) => { // three squares, noded by the one noding, kept where all three are
    const R = nodeCrossings([sq(0, 0, 6), sq(2, 2, 6), sq(4, 0, 6)].map((r, i) => ({ p: r.map(([x, y]) => [x / 1000, y / 1000]), tag: `s${i}` })), { pairs: () => true, who: 'check (d)' })
    const E = []; R.forEach((o, i) => o.forEach((v, k) => E.push({ a: v.k, b: o[(k + 1) % o.length].k, set: i })))
    const F = fo(E, w => w[0] > 0 && w[1] > 0 && w[2] > 0, { sets: 3, who: 'check (d)' }); F.noded = new Set(E.map(e => e.a.join(','))); return F },
}
const WANT = { hole: '-32,200', pinch: '8,8', cancel: '16', three: '16' }   // twice the areas: the hole 4², the square 10²; the common square 2 × 4

// (a)–(d) and (f): the live facesOf
for (const [k, name] of [['hole', '(a) a square with a hole'], ['pinch', '(b) a pinch'], ['cancel', '(c) opposite edges cancel'], ['three', '(d) three sets overlap']]) {
  const r = tryF(() => ROWS[k](facesOf))
  if (r.err) { row(false, `${name}: REFUSED — ${r.err.slice(0, 140)}`); continue }
  row(sig(r.F) === WANT[k], `${name}: ${r.F.rings.length} ring(s), twice the areas [${sig(r.F)}] (want [${WANT[k]}]) · the books balanced (facesOf refuses otherwise)`)
}
{ const r = tryF(() => ROWS.three(facesOf)), bad = r.err ? null : r.F.rings.flat().filter(p => !r.F.noded.has(p.X + ',' + p.Y)).length
  row(bad === 0, `(d) every vertex out is a noded vertex: ${r.err ? 'REFUSED' : `${bad} not noded`}`) }
// (e) refusals by name
{
  const T = tryF(() => facesOf([...ring([[0, 0], [4, 0], [4, 4], [0, 4]]), ...ring([[3, -1], [3, 0], [2, 0]])], w => w[0] > 0, { sets: 1, who: 'check (e)' }))
  row(/lies inside the segment/.test(T.err || ''), `(e) a T refuses by name: ${(T.err || 'NO REFUSAL').slice(0, 110)}`)
  const X = tryF(() => facesOf([...ring(sq(0, 0, 4)), ...ring(sq(2, 2, 4))], w => w[0] > 0, { sets: 1, who: 'check (e)' }))
  row(/cross at/.test(X.err || ''), `(e) an un-noded crossing refuses by name: ${(X.err || 'NO REFUSAL').slice(0, 110)}`)
  const O = tryF(() => facesOf([{ a: [0, 0], b: [4, 0], set: 0 }, { a: [4, 0], b: [4, 4], set: 0 }], w => w[0] > 0, { sets: 1, who: 'check (e)' }))
  row(/two windings/.test(O.err || ''), `(e) an open chain (not closed rings) refuses by name: ${(O.err || 'NO REFUSAL').slice(0, 110)}`)
}
// (g) lineCrossOf and sameLine
{
  const X = lineCrossOf({ a: [0, 0], b: [1, 0] }, { a: [3, 1], b: [3, 2] })
  row(X[0] === 3 && X[1] === 0, `(g) lineCrossOf: the crossing past both segments, exact: (${X})`)
  const half = lineCrossOf({ a: [0, 0], b: [2, 1] }, { a: [1, 0], b: [1, 2] })
  row(half[0] === 1 && half[1] === 1, `(g) lineCrossOf rounds a tie half-up: (1, 0.5) → (${half})`)
  const P = tryF(() => lineCrossOf({ a: [0, 0], b: [4, 0] }, { a: [0, 1], b: [4, 1] }, 'check (g)'))
  row(/parallel/.test(P.err || ''), `(g) parallel lines refuse by name: ${(P.err || 'NO REFUSAL').slice(0, 100)}`)
  row(sameLine({ a: [0, 0], b: [4, 2] }, { a: [6, 3], b: [8, 4] }) && !sameLine({ a: [0, 0], b: [4, 2] }, { a: [6, 4], b: [8, 5] }), `(g) sameLine is exact: one line ✓, a parallel one unit off ✗`)
}
// (h) self
{
  const bow = [[0, 0], [0.004, 0.004], [0.004, 0], [0, 0.004]]                 // a bow-tie: its two diagonals cross at (2, 2)
  const off = tryF(() => nodeCrossings([{ p: bow, tag: 'bow' }], { pairs: () => true, who: 'check (h)' }))
  const on = tryF(() => nodeCrossings([{ p: bow, tag: 'bow' }], { pairs: () => true, self: true, who: 'check (h)' }))
  row(!off.err && off.F[0].length === 4 && !on.err && on.F[0].some(v => v.k[0] === 2 && v.k[1] === 2), `(h) self: a ring crossing itself is noded at (2, 2) with self (${on.err ? 'REFUSED' : on.F[0].length + ' vertices'}), untouched without (${off.err ? 'REFUSED' : off.F[0].length})`)
  const tj = tryF(() => nodeCrossings([{ p: bow, tag: 'bow' }], { pairs: () => true, self: true, tjoin: true, who: 'check (h)' }))
  row(/tjoin.*self/.test(tj.err || ''), `(h) tjoin with self refuses by name: ${(tj.err || 'NO REFUSAL').slice(0, 90)}`)
  const K = [bow.map(([x, y]) => [x * 1000, y * 1000])], R = [K[0].map(k => ({ k }))], hot = new Map(K[0].map(([x, y]) => [x + ',' + y, {}]))
  const vs = tryF(() => verifyNoded(K, R, () => true, ['bow'], 'check (h)', hot, [], true)), vn = tryF(() => verifyNoded(K, R, () => true, ['bow'], 'check (h)', hot, [], false))
  row(/still cross/.test(vs.err || '') && !vn.err, `(h) verifyNoded with self refuses a planted self-crossing (${vs.err ? 'refused' : 'NO REFUSAL'}), without self passes it (${vn.err ? 'refused' : 'passed'})`)
  const src = readFileSync(NODE, 'utf8'), body = src.slice(src.indexOf('export function nodeCrossings('))
  row(/verifyNoded\(K, R,[^\n]*, self\)/.test(body.slice(0, body.indexOf('\n}\n'))), `(h) nodeCrossings passes \`self\` to verifyNoded (read)`)
}
// MUTANTS, the source rewritten and imported (its own imports pinned to the live latticeNode.js)
const mutant = async (from, to) => { const s = readFileSync(FACES, 'utf8'); if (!s.includes(from)) return null
  const m = s.replace(from, to).replace("from './latticeNode.js'", `from '${pathToFileURL(NODE).href}'`)
  return (await import('data:text/javascript;base64,' + Buffer.from(m).toString('base64'))).facesOf }
{
  const d1 = [100000001, 100000000], d2 = [100000000, 99999999]                        // cross = −1, products near 10^16
  row(angleCmp(d1, d2) !== angleCmp(d1, d2, true), `mutant: the angle sort in doubles orders a −1-cross pair near 10^16 differently from the exact sort (live ${angleCmp(d1, d2)}, doubles ${angleCmp(d1, d2, true)})`)
  const M1 = await mutant('me.m[e.set] += dir', 'me.m[e.set] = dir')
  const r1 = M1 && tryF(() => ROWS.cancel(M1))
  row(M1 && (r1.err || sig(r1.F) !== WANT.cancel), `mutant: a merged edge keeps only its last multiplicity ⇒ row (c) changes: ${!M1 ? 'NOT CHECKED — the line moved' : r1.err ? 'refused: ' + r1.err.slice(0, 60) : `[${sig(r1.F)}]`}`)
  const M2 = await mutant('const c = l[(i - k + l.length * 2) % l.length]', 'const c = l[(i + k) % l.length]')
  const r2 = M2 && tryF(() => ROWS.pinch(M2))
  row(M2 && (r2.err || sig(r2.F) !== WANT.pinch || r2.F.rings.length !== 2), `mutant: the boundary walk turns counter-clockwise ⇒ the pinch or the books break: ${!M2 ? 'NOT CHECKED — the line moved' : r2.err ? 'refused: ' + r2.err.slice(0, 70) : `[${sig(r2.F)}]`}`)
  const r3 = tryF(() => ROWS.hole(facesOf, w => w[0] >= 0))
  row(r3.err || sig(r3.F) !== WANT.hole, `mutant: the keep predicate at ≥ 0 ⇒ row (a) changes: ${r3.err ? 'refused' : `[${sig(r3.F)}]`}`)
}
console.log(red ? '\n⛔ RED — a face is not walked once, a vertex is not a noded vertex, or a mutant was not caught'
  : '\n✅ GREEN — the faces are walked once, exactly, every vertex out is a noded vertex, and every mutant is caught')
process.exit(red ? 1 : 0)
