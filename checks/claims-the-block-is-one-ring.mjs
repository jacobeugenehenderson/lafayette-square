// claims-the-block-is-one-ring.mjs — ② IS ONE RING PER TILE: THE CONTOUR THE BANDS ARE STRUCK FROM AND THE BLOCK THE ASPHALT IS
// CUT FROM NEVER RUN AS TWO LINES (02da626e's MORNING item 1, its first site; Boz, 2026-10-21, on Zob's measure).
//
// The painter strikes the bands from `iaFull` (uncut, so a rim band is cut, never bent around the rim) and confines them, and
// cuts the asphalt, with `iA` (the block, cut by the face trim and the circle). Each cut rounded its crossing onto the lattice
// in `iA` alone, so a cut sub-edge tilted off the struck edge it came from (LS tile 1, jules-street: ≤ 0.4 mm along 79 m):
// LS 4,202 m and HPDM 6,393 m of iA beside iaFull, all on rim tiles. Rows, per town, on the live producer (`_proto-feed`):
//   1. every iA edge lies on an edge of iaFull, of the stamp or of the tile ring, exactly on the integer grid (a run of exactly
//      collinear vertices, which Clipper drops, is one edge; nothing else is excused);
//   2. every iA vertex is a vertex of iaFull, of the stamp (the disc), or of the tile ring off its rim edges (where the ring runs
//      inside the curb; the ring's rim edges carry the circle's crossings too, so they excuse nothing);
//   3. a tile no cut reached (no rim edge, no ring vertex in its block) carries iA AS iaFull, vertex for vertex: a trim that
//      cuts nothing does not re-emit the block (Clipper's copy of iaFull, LS 59 of 91 interior tiles).
// ⭐ MUTATION TEST: `--selftest` builds with a copy of tileGround.js (OS temp dir) carrying both mutations behind a switch:
//   the cut's crossings not written into iaFull (rows 1 and 2 RED) · the face trim re-run where it cuts nothing (row 3 RED).
//   node checks/claims-the-block-is-one-ring.mjs [--scene=<town> …] [--selftest]      (default: every town whose ribbons can be measured)
import { ROOT, ribbonScenes } from './_scenes.mjs'
import { join } from 'node:path'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto } from '../scratch/_proto-feed.mjs'
import { CLIP_SCALE } from '../src/lib/lattice.js'

const argv = process.argv.slice(2), self = argv.includes('--selftest')
const SCENES = argv.filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
const TOWNS = SCENES.length ? SCENES : ribbonScenes([])   // ⛔ no typed roster: the measurable towns, read (checks/_scenes.mjs)
const K = (v) => Math.round(v[0] * CLIP_SCALE) + ',' + Math.round(v[1] * CLIP_SCALE)

const rows = async (tg, f, town) => {
  const q = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}
  let R; try { R = buildProto(f, { quiet: true, tg }) } finally { console.log = q; console.warn = w }
  const stamp = new Set((R.protoBoundaryRing || []).map(K))
  // an iA edge lies on a contour C when its two ends are vertices of one ring of C and every vertex of C between them, the
  // shorter way, lies on their integer line exactly (Clipper drops exactly collinear vertices; nothing else is excused)
  const I = (v) => [Math.round(v[0] * CLIP_SCALE), Math.round(v[1] * CLIP_SCALE)]
  const indexOf = (rings) => { const at = new Map(); rings.forEach((r, ri) => r.forEach((v, i) => { const k = K(v); if (!at.has(k)) at.set(k, []); at.get(k).push([ri, i]) })); return at }
  const lies = (rings, at, a, b) => { for (const [ri, i] of at.get(K(a)) || []) for (const [rj, j] of at.get(K(b)) || []) { if (ri !== rj) continue
      const r = rings[ri], n = r.length, A = I(a), B = I(b), f = (j - i + n) % n, g = (i - j + n) % n, [s0, len] = f <= g ? [i, f] : [j, g]
      let ok = true; for (let k = 1; k < len && ok; k++) { const P = I(r[(s0 + k) % n]); ok = (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]) === 0 }
      if (ok) return true }
    return false }
  const S = R.protoBoundaryRing ? [R.protoBoundaryRing] : [], atS = indexOf(S)
  let off = 0, offAt = null, stray = 0, strayAt = null, untouched = 0, reEmitted = 0, reAt = null
  for (const t of R.protoShapeTiles || []) { if (!t?.iA?.length || !t?.iaFull?.length) continue
    const atF = indexOf(t.iaFull), atR = indexOf([t.ring])
    for (const r of t.iA) r.forEach((a, i) => { const b = r[(i + 1) % r.length]
      if (!lies(t.iaFull, atF, a, b) && !lies(S, atS, a, b) && !lies([t.ring], atR, a, b)) { off++; offAt ||= a } })
    const full = new Set(t.iaFull.flat().map(K)), ring = new Set(t.ring.map(K)), n = t.ring.length
    // a ring vertex the block may take is one where the ring runs inside the curb: never one on a rim edge, which is where the
    // circle's own crossings are written into the ring (shareRimCrossings), so it cannot excuse one iaFull lacks
    const rimV = (i) => t.ringOwner?.[i]?.kind === 'rim' || t.ringOwner?.[(i - 1 + n) % n]?.kind === 'rim'
    const ringOK = new Set(t.ring.filter((_, i) => !rimV(i)).map(K))
    for (const v of t.iA.flat()) { const k = K(v); if (!full.has(k) && !stamp.has(k) && !ringOK.has(k)) { stray++; strayAt ||= v } }
    const cut = (t.ringOwner || []).some(o => o?.kind === 'rim') || t.iA.flat().some(v => ring.has(K(v)) && !full.has(K(v)))
    if (cut) continue
    untouched++; if (JSON.stringify(t.iA) !== JSON.stringify(t.iaFull)) { reEmitted++; reAt ||= t.ring[0] } }
  const xy = (p) => p ? `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})` : ''
  return [[`${town}: every iA edge lies on an iaFull, stamp or ring edge (${off} not${offAt ? ', first at ' + xy(offAt) : ''})`, off === 0],
    [`${town}: every iA vertex is an iaFull, stamp or ring vertex (${stray} not${strayAt ? ', first at ' + xy(strayAt) : ''})`, stray === 0],
    [`${town}: a tile no cut reached carries iA as iaFull (${untouched - reEmitted} of ${untouched}${reAt ? '; re-emitted at ' + xy(reAt) : ''})`, untouched > 0 && reEmitted === 0]]
}
const TGF = join(ROOT, 'src/lib/tileGround.js')
const A1 = 'function shareIntoFull(st, pts, where) {\n  if (!pts.length)'
const A2 = 'protoShapeTiles = protoShapeTiles.map(t => { if (!t.iA?.length || !differenceRings(t.iA, [t.ring]).length)'
// ⭐ ONE mutated copy (checks/tier.mjs reads one temp-dir `mutant`) carrying both mutations behind a switch read at call time
const mutant = () => { const src = readFileSync(TGF, 'utf8')
  for (const a of [A1, A2]) if (src.split(a).length !== 2) throw new Error(`selftest: tileGround.js no longer carries \`${a.slice(0, 80)}\` — re-aim the mutation`)
  const out = join(mkdtempSync(join(tmpdir(), 'one-ring-tg-')), 'tileGround.js')
  writeFileSync(out, src.replace(A1, "function shareIntoFull(st, pts, where) {\n  if (!pts.length || globalThis.__ONE_MUT === 'noshare')")
    .replace(A2, "protoShapeTiles = protoShapeTiles.map(t => { if (!t.iA?.length || (globalThis.__ONE_MUT !== 'retrim' && !differenceRings(t.iA, [t.ring]).length))")
    .replace(/from 'clipper-lib'/g, `from '${pathToFileURL(join(ROOT, 'node_modules/clipper-lib/clipper.js')).href}'`)
    .replace(/from '\.\/([^']+)'/g, (_, m) => `from '${pathToFileURL(join(ROOT, 'src/lib', m)).href}'`)
    .replace(/from '\.\.\/([^']+)'/g, (_, m) => `from '${pathToFileURL(join(ROOT, 'src', m)).href}'`))
  return pathToFileURL(out).href }
const feeds = TOWNS.map(t => [t, feed(t)])
if (feeds.some(([, f]) => !f)) { console.log('⛔ a town has no feed: the block is NOT checked there'); process.exit(1) }
const loadTG = async (tgUrl) => import(tgUrl)
if (self) { const tgCopy = mutant()
  const tg = await loadTG(tgCopy); let bad = 0
  for (const [k, name, rs] of [['noshare', "the cut's crossings not written into iaFull", [0, 1]], ['retrim', 'the face trim re-run where it cuts nothing', [2]]]) {
    globalThis.__ONE_MUT = k; const R = (await Promise.all(feeds.map(([t, f]) => rows(tg, f, t)))).flatMap(x => x)
    const red = feeds.every((_, i) => rs.every(r => !R[i * 3 + r][1]))
    if (!red) bad++; console.log(`  ${red ? '✅' : '⛔'} mutant · ${name}: ${red ? 'RED, as it must be' : 'still GREEN — the check cannot see it'} (${R.filter(r => !r[1]).map(r => r[0]).join(' · ')})`) }
  globalThis.__ONE_MUT = null; const R0 = (await Promise.all(feeds.map(([t, f]) => rows(tg, f, t)))).flatMap(x => x)
  if (!R0.every(r => r[1])) { bad++; console.log('  ⛔ the mutated copy, switched off, is not GREEN — the mutation changed more than its switch') }
  process.exit(bad ? 1 : 0) }
const R = []; for (const [t, f] of feeds) R.push(...await rows(null, f, t))
for (const [m, ok] of R) console.log(`  ${ok ? '✅' : '⛔'} ${m}`)
const ok = R.every(r => r[1])
console.log(ok ? '✅ ② is one ring: the bands and the block share every edge' : '⛔ ② runs as two lines: a cut crossing is not in the struck contour'); process.exit(ok ? 0 : 1)
