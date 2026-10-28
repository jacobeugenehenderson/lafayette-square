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
//   ② the snap reads latticeNode's own NODE_BOUND (read from the source), no constant of its own.
// ⭐ MUTANT (--mutants): the snap removed (the old float behaviour) → the corner refuses → RED.
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
function claims({ offsetRingByRects }, src) {
  const out = []
  try { const r = offsetRingByRects(RING, (i) => DEPTH[i], false, null, null, { water: WATER })
    if (!Array.isArray(r) || !r.length || r.some(q => !(q?.length >= 3))) out.push(`① the corner built no ring (${JSON.stringify(r).slice(0, 80)})`)
  } catch (e) { out.push(`① the 90° corner refuses: ${e.message.slice(0, 160)}`) }
  if (!src.includes(SNAP) || !/import \{[^}]*\bNODE_BOUND\b[^}]*\} from '\.\/latticeNode\.js'/.test(src)) out.push('② the run-on snap does not read latticeNode.js#NODE_BOUND')
  return out
}
const SRC = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
let bad = 0
const real = claims(await tg('real'), SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ the measured 90° street/water corner builds; the run-on snaps X to the curb line\'s start within latticeNode#NODE_BOUND')
if (MUTANTS) { const got = claims(await tg('no-snap', (t) => { if (!t.includes(SNAP)) throw new Error('[mutant] the snap is gone — re-aim it'); return t.replace(SNAP, '') }), SRC), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · the snap removed (the old float behaviour): ${red ? `RED, as it must be (${got[0]})` : '⛔ still builds — the check cannot see it'}`) }
console.log(bad ? '\n⛔ RED — a street band meeting a water run at 90° refuses on a degenerate piece' : '\n✅ GREEN')
process.exit(bad ? 1 : 0)
