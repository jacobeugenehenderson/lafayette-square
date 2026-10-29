// park-stairs-cost.mjs — C9's ParkStairs (LafayetteParkBody.jsx): how many flights, how many take the field-sampled
// fallback (no 3DEP probe record), and what the geometry build costs. Read-only; LS's bundled park data.
// ▶ node scratch/far-shore/park-stairs-cost.mjs
import { readFileSync } from 'node:fs'
import { buildParkPathRings } from '../../src/lib/parkPaths.js'
import { buildStairGeometry } from '../../src/lib/buildStairGeometry.js'
const j = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const ribbons = j('../../src/data/ribbons.json'), polygon = j('../../cartograph/data/lafayettesquare/clean/park-polygon.json')
const water = j('../../src/data/lafayettesquare/park_water.json'), elev = j('../../src/data/park-feature-elev.json')
// the component's own lookup, by source (not retyped): eval the function text out of the JSX
const src = readFileSync(new URL('../../src/components/LafayetteParkBody.jsx', import.meta.url), 'utf8')
const fnText = src.slice(src.indexOf('function lookupStepElev'), src.indexOf('\n}\n', src.indexOf('function lookupStepElev')) + 2)
const lookupStepElev = new Function(`${fnText}; return lookupStepElev`)()
let t = performance.now(); const { steps } = buildParkPathRings(ribbons, { polygon, water }); const tRings = performance.now() - t
let fallback = 0; t = performance.now()
for (const s of steps) { const a = s.points[0], b = s.points[s.points.length - 1], probe = lookupStepElev(a, b, elev?.steps)
  if (!probe) fallback++
  buildStairGeometry(s.points, { width: s.pavedWidth || 1.5, descendToB: true, drop: probe ? Math.abs(probe.elevA - probe.elevB) : null }) }
console.log(`ParkStairs: ${steps.length} flights · ${fallback} take the field fallback (2 field reads each, a direction only) · buildParkPathRings ${tRings.toFixed(0)} ms · stair geometry ${(performance.now() - t).toFixed(1)} ms`)
