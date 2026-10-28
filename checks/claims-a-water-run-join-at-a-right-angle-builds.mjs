#!/usr/bin/env node
// claims-a-water-run-join-at-a-right-angle-builds.mjs — DOES A STREET BAND MEETING A DEPTH-0 WATER RUN AT 90° BUILD, WHEN THE
// RUN LIES ALONG THE BAND'S NORMAL?
//
// ⭐ PTown on coast v5 (2026-10-28): the ground refused "the join at ① vertex 4696 (266.635, 528.585) runs on along its depth-0 run
// … and the piece is not simple". The site is Fishermen's Wharf: a deck street (provincetown-marina-1, band depth 0.905) on a pier
// footprint buffered at half its OSM width=3 (structures.mjs#deckInputs, by design), so ① is a 1.49 m × 68 m strip with square
// ends. At its 90° end the band's inward offset runs exactly along the water cap, so the curb line's start (S.P) lies ON the run,
// and src/lib/tileGround.js#offsetRingByRects' run-on found X there, 26 µm off. The piece repeated a vertex, and the crossing test
// refused that degenerate TRIANGLE on float noise. Boz's ruling: an X within latticeNode.js#NODE_BOUND of the curb line's own start
// IS that start (the doctrine's one join rule, no new number), so the piece is the triangle.
//   ① the measured corner (① vertices 4693–4697 at that site, closed by the strip's water end cap), through the real
//      offsetRingByRects with its water labels: it builds, and every ring it returns is non-empty;
//   ①b THE RING ② RETURNS (Zob: the stamp's noding hid the antenna once), on the REAL ② call at that tile (the labelled
//      offsetRingByRects call holding ① v4696, 11,608 vertices, with its edge depths, water flags, working-copy map, owners and
//      ease: checks/fixtures/ptown-fishermens-wharf-run-on.json, dumped from the v5c build). A snapped run's passed ① vertices are
//      CONSUMED, so ② keeps neither ① 4695 (266.667, 528.226) nor v (266.635, 528.585): it reaches X along its water edge, and
//      X→v is the band's own end edge. Kept, they make the sub-lattice lobe X, v, 4695 that iaFull turns into the antenna the
//      stamp refused. (The 5-vertex corner of ① cannot show this: on so small a ring the difference rounds the sliver away.)
//   ①c THE SIDE (Zob's guard): a consumed run's piece must lie on the side its mode removes (inward: the ring's winding sign). A
//      far-side piece does not arise from geometry here (the curb line then leaves the run uncrossed, kind 'none'), so it is PLANTED
//      at the guard: the real run at the corner, its passed vertex reflected across its chord v→X, through the real guards → refuses
//      by name ("a run piece on the far side of its chord"); a COLLINEAR piece of exactly zero area (an axis-aligned chord, the
//      passed vertex at its midpoint, as on an axis-aligned pier) passes (Zob: only the opposite sign refuses).
//   ② the snap reads latticeNode's own NODE_BOUND (read from the source), no constant of its own.
// ⭐ MUTANTS (--mutants), each RED: the snap removed (the old float behaviour: the corner refuses) · the consumed shortcut removed
// (ringB = ring: the antenna X, 4695, v, X comes back in ②) · the side guard removed (the planted far-side piece goes through) ·
// the strict sign test (!== expected: the collinear piece refuses).
//   node checks/claims-a-water-run-join-at-a-right-angle-builds.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const SNAP = '          if (h && Math.hypot(h[0] - o[0], h[1] - o[1]) * SCALE <= NODE_BOUND) h = o\n'
// a data: import cannot resolve a bare package name (clipper-lib): each is handed its resolved file URL
const bare = (t) => t.replace(/^(\s*import\s+(?:[^'"\n]*?\sfrom\s*)?)(['"])([a-z@][^'"]*)\2/gm, (m, kw, q, spec) => spec.startsWith('file:') || spec.startsWith('data:') ? m : `${kw}${q}${import.meta.resolve(spec)}${q}`)
const tg = (tag, transform) => tag === 'real' ? import('../src/lib/tileGround.js') : importSource('src/lib/tileGround.js', { suffix: `// ${tag}`, transform: (t) => bare(transform ? transform(t) : t) })

// PTown ① at Fishermen's Wharf (coast v5, swash/embankment-hold): 4693 → 4694 water (the deck's long edge), 4694 → 4695 → 4696 water
// (the square cap), 4696 → 4697 the band provincetown-marina-1|right|0 at 0.905, and 4697 → 4693 the strip's other water cap
const RING = [[333.475, 532.995], [266.766, 527.101], [266.667, 528.226], [266.635, 528.585], [341.905, 535.245]]
const DEPTH = [0, 0, 0, 0.905, 0], WATER = [true, true, true, false, true]
const FX = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/ptown-fishermens-wharf-run-on.json'), 'utf8'))
const OWN = new Map(FX.ring.map((_, i) => [FX.e ? FX.e[i] : i, FX.ownerKeys[FX.owner[i]] || null]))
const CONSUMED = [['① 4695', [266.667, 528.226]], ['v (① 4696)', [266.635, 528.585]]]
function claims({ offsetRingByRects }, src, plantFar = null, plantLine = null) {
  const out = []
  try { const r = offsetRingByRects(RING, (i) => DEPTH[i], false, null, null, { water: WATER })
    if (!Array.isArray(r) || !r.length || r.some(q => !(q?.length >= 3))) out.push(`① the corner built no ring (${JSON.stringify(r).slice(0, 80)})`)
  } catch (e) { out.push(`① the 90° corner refuses: ${e.message.slice(0, 160)}`) }
  try { const r = offsetRingByRects(FX.ring, (i) => FX.depth[i], false, {}, (v) => FX.ease[v] ?? 0, { water: FX.water.map(Boolean), hwy: FX.hwy, e: FX.e, v: FX.v }, (e) => OWN.get(e))
    for (const [name, c] of CONSUMED) if (r.some(q => q.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.001))) out.push(`①b ② keeps ${name} (${c.join(', ')}), a vertex the run consumed: the sliver lobe X, v, 4695 survives into iaFull`)
  } catch (e) { out.push(`①b the real ② call refuses: ${e.message.slice(0, 160)}`) }
  // ①c a far-side piece, planted at the guard (the plant hook lives only in this import's text; the guards are the real ones)
  if (plantFar) { try { plantFar.offsetRingByRects(RING, (i) => DEPTH[i], false, null, null, { water: WATER }); out.push('①c a run piece planted on the far side of its chord went through: the shortcut would add land') }
    catch (e) { if (!/a run piece on the far side of its chord/.test(e.message)) out.push(`①c the far-side piece refused, but not by the side guard: ${e.message.slice(0, 120)}`) } }
  if (plantLine) { try { plantLine.offsetRingByRects(RING, (i) => DEPTH[i], false, null, null, { water: WATER }) } catch (e) { out.push(`①c a COLLINEAR run piece (zero area, its passed vertex on the chord) refuses: ${e.message.slice(0, 120)}`) } }
  if (!src.includes(SNAP) || !/import \{[^}]*\bNODE_BOUND\b[^}]*\} from '\.\/latticeNode\.js'/.test(src)) out.push('② the run-on snap does not read latticeNode.js#NODE_BOUND')
  return out
}
const SRC = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
// the plant: just before the guards read the runs, the snapped run's passed vertex is reflected across its chord v→X
const PLANT = ['  const consumedAt = new Map()\n', "  const consumedAt = new Map()\n  for (const j of J) if (j?.kind === 'run' && j.consumed?.length) { const c = [j.X[0] - j.v[0], j.X[1] - j.v[1]], L = Math.hypot(c[0], c[1]), u = [c[0] / L, c[1] / L], rf = (p) => { const d = [p[0] - j.X[0], p[1] - j.X[1]], t = d[0] * u[0] + d[1] * u[1]; return [j.X[0] + 2 * t * u[0] - d[0], j.X[1] + 2 * t * u[1] - d[1]] }; j.passed = j.passed.map(rf); j.piece = j.zSide === 'A' ? [j.v, ...j.passed, j.X] : [j.v, j.X, ...j.passed.slice().reverse()] }\n"]
// the collinear plant: an axis-aligned chord (X straight below v, as on an axis-aligned pier) with the passed vertex at its midpoint,
// so the piece's area is EXACTLY zero (equal x's: the shoelace cancels exactly), not a float projection's ±1e-18
const LINE = ['  const consumedAt = new Map()\n', "  const consumedAt = new Map()\n  for (const j of J) if (j?.kind === 'run' && j.consumed?.length) { j.X = [j.v[0], j.X[1]]; j.passed = j.passed.map(() => [j.v[0], (j.v[1] + j.X[1]) / 2]); j.piece = j.zSide === 'A' ? [j.v, ...j.passed, j.X] : [j.v, j.X, ...j.passed.slice().reverse()] }\n"]
const PROJECT = (t) => { if (!t.includes(LINE[0])) throw new Error('[plant] the guard site is gone — re-aim it'); return t.replace(LINE[0], LINE[1]) }
const SIDE = "    if (Math.sign(signedArea(j.piece)) === -(outward ? -1 : 1) * Math.sign(signedArea(ring))) throw new Error("
const planted = (tag, extra = (t) => t, line = false) => tg(tag, (t) => { if (!t.includes(PLANT[0])) throw new Error('[plant] the guard site is gone — re-aim it'); return extra(line ? PROJECT(t) : t.replace(PLANT[0], PLANT[1])) })
let bad = 0
const real = claims(await tg('real'), SRC, await planted('plant-far'), await planted('plant-line', (t) => t, true))
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ the measured 90° street/water corner builds; the run-on snaps X to the curb line\'s start within latticeNode#NODE_BOUND')
if (MUTANTS) for (const [what, tag, from, to] of [['the snap removed (the old float behaviour)', 'no-snap', SNAP, ''],
  ['the consumed shortcut removed (ringB = ring)', 'no-consume', "  const ringB = consumedAt.size ? ring.flatMap(", "  const ringB = false ? ring.flatMap("],
  ['the side guard removed', 'no-side', SIDE, '    if (false) throw new Error('],
  ['the strict sign test (!== expected)', 'strict', SIDE, '    if (Math.sign(signedArea(j.piece)) !== (outward ? -1 : 1) * Math.sign(signedArea(ring))) throw new Error(']]) {
  const mut = (t) => { if (!t.includes(from)) throw new Error(`[mutant ${tag}] the text it mutates is gone — re-aim it`); return t.replace(from, to) }
  const got = claims(await tg(tag, mut), SRC, await planted(tag + '-plant', mut), await planted(tag + '-line', mut, true)), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0].slice(0, 170)})` : '⛔ still clean — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — a street band meeting a water run at 90° refuses on a degenerate piece' : '\n✅ GREEN')
process.exit(bad ? 1 : 0)
