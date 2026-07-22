// cap-mouth-classify.mjs — WHICH POLYGON OWNS THE STUB?
//
// At a wrapped dead-end mouth the treelawn butt-ends in a squared stub with a
// stranded wedge inside the concrete. Two candidate roots, with different fixes:
//   (a) an UNCLAIMED band — no ped layer owns it, so it floods to LU/remainder
//       (the "squared bite" theory: the leg ends before the pad begins);
//   (b) the corner pad's own LU carve-wedge (SECTION §6.1 step 5, Idea-A) landing
//       wrong at a mouth — a claimed region, just routed to the wrong material.
//
// (a) shows up as points owned by NOTHING/LU sitting between sidewalk and the
// curb; (b) shows up as LU that IS inside the corner sector. This samples a grid
// at the mouth and reports the composition, so the eye's "stub" gets a name.
//
//   node scratch/cap-mouth-classify.mjs [skelId] [halfExtent_m] [step_m]
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const skelId = process.argv[2] || 'simpson-place'
const HALF = +(process.argv[3] || 14)
const STEP = +(process.argv[4] || 0.25)

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}

const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, {
  smooth: 0, emitArtifact: true,
  blockCustoms: design.blockCustoms || null,
  curbWidth: design.curbWidth ?? 0.15,
})
console.log = o

// the mouth we're inspecting
let mouth = null
for (const st of (g._shapeArtifact || [])) for (const m of (st.mouths || [])) if (m.spurSkel === skelId) mouth = m
if (!mouth) { console.error(`no mouth for ${skelId}`); process.exit(1) }
const M = mouth.mid

// even-odd point-in-rings (handles holes stored as separate rings)
const inRings = (rings, x, y) => {
  let inside = false
  for (const r of rings || []) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
    }
  }
  return inside
}

// layers in PAINT order (last match wins visually; we report the topmost owner)
const layers = []
layers.push(['asphalt', g.asphalt])
layers.push(['curb', g.curb])
for (const [lu, rings] of Object.entries(g.treelawnByLu || {})) layers.push([`treelawn[${lu}]`, rings])
layers.push(['sidewalk', g.sidewalk])
for (const [cls, rings] of Object.entries(g.luByClass || {})) layers.push([`LU[${cls}]`, rings])

const tally = new Map()
const unowned = []
let n = 0
for (let dx = -HALF; dx <= HALF; dx += STEP) {
  for (const dy0 of [0]) void dy0
  for (let dy = -HALF; dy <= HALF; dy += STEP) {
    const x = M[0] + dx, y = M[1] + dy
    n++
    const owners = layers.filter(([, rings]) => inRings(rings, x, y)).map(([name]) => name)
    const key = owners.length ? owners.join(' + ') : '(NOTHING — bare remainder)'
    tally.set(key, (tally.get(key) || 0) + 1)
    if (!owners.length) unowned.push([+x.toFixed(2), +y.toFixed(2)])
  }
}

const A = (c) => (c * STEP * STEP).toFixed(1) + ' m2'
console.log(`MOUTH ${skelId} at [${M[0].toFixed(1)},${M[1].toFixed(1)}] — ${n} samples over ±${HALF} m @ ${STEP} m`)
console.log(`(topmost owner per sample; "+" = overlapping layers)\n`)
for (const [k, c] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(A(c)).padStart(10)}  ${(100 * c / n).toFixed(1).padStart(5)}%   ${k}`)
}

// Where does the UNOWNED area sit relative to the two corner apexes? (a) predicts
// unowned hugging the curb between leg-end and pad-start.
if (unowned.length) {
  const near = (apex) => unowned.filter(p => Math.hypot(p[0] - apex[0], p[1] - apex[1]) < 8).length
  console.log(`\nUNOWNED samples: ${unowned.length} (${A(unowned.length)})`)
  for (const [nm, apex] of [['apexA', mouth.apexA], ['apexB', mouth.apexB]].filter(e => e[1])) {
    console.log(`   within 8 m of ${nm} [${apex[0].toFixed(1)},${apex[1].toFixed(1)}]: ${near(apex)} samples (${A(near(apex))})`)
  }
}
