// claims-the-bezel-carries-no-towns-constant.mjs — the compass bezel is the TOWN's disc, never town #1's.
//
// ⭐ THE CLAIM (BRIEF-compass-bezel §6): radius, centre and tick count come from the town's own disc
// and its Look — no constant in the bezel is a town's. Layer 0's quietest form is a number that
// happened to be right for the first town; this check is built to catch exactly that.
//
// Three ways, each reading its truth from source, never restating it:
//   (1) BEHAVIOUR — every radial size scales with the radius and moves with the centre, and the
//       divisions are angles: a disc k× larger gives the same ticks at k× the metres.
//   (2) EVERY TOWN ON DISK — each town's model is built from its own ground.json stencil and
//       carries exactly that centre and radius; a town with no disc refuses with a reason.
//   (3) NO LITERAL — neither bezel file contains any town's radius or centre as a number.
// Plus: an authored `compass` block wins over the neutral default, and a bad one throws.
//
//   node checks/claims-the-bezel-carries-no-towns-constant.mjs
import fs from 'fs'
import path from 'path'
import { bezelModel, BEZEL_DEFAULTS } from '../src/lib/compassBezel.js'

const FILES = ['src/lib/compassBezel.js', 'src/components/CompassBezel.jsx']
const BAKED = 'public/baked'
let failures = 0
const fail = (m) => { failures++; console.log(`  ✗ ${m}`) }
const pass = (m) => console.log(`  ✓ ${m}`)
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

// ── 1. behaviour: scale and translate a disc; the bezel must follow exactly ──────────────────────
console.log('\n(1) the bezel follows its disc')
const A = bezelModel({ center: [0, 0], radius: 1000 })
const k = 3.7, off = [123.4, -567.8]
const B = bezelModel({ center: off, radius: 1000 * k })
if (!A.ok || !B.ok) fail('a plain disc did not build a bezel')
else {
  let bad = 0
  if (A.ticks.length !== B.ticks.length) { bad++; fail(`tick count changed with the radius: ${A.ticks.length} → ${B.ticks.length}`) }
  A.ticks.forEach((t, i) => {
    const u = B.ticks[i]
    if (!u || u.bearing !== t.bearing || u.kind !== t.kind || !near(u.inner, t.inner * k) || !near(u.outer, t.outer * k) || !near(u.width, t.width * k)) bad++
  })
  A.cardinals.forEach((c, i) => { const d = B.cardinals[i]; if (!near(d.r, c.r * k) || !near(d.size, c.size * k)) bad++ })
  if (B.center[0] !== off[0] || B.center[1] !== off[1]) { bad++; fail('the centre was not carried') }
  if (bad) fail(`${bad} tick/letter size(s) did not scale with the radius`)
  else pass(`${A.ticks.length} ticks and ${A.cardinals.length} letters scale ×${k} and move with the centre; the spacing is an angle`)
}

// ── 2. every town on disk: its own disc, or a named refusal ────────────────────────────────────────
console.log('\n(2) every town, from its own ground.json stencil')
const towns = fs.readdirSync(BAKED).filter((t) => fs.existsSync(path.join(BAKED, t, 'ground.json')))
if (!towns.length) { console.log('  ⛔ NOT CHECKED — no baked ground.json on disk'); process.exit(2) }
const stencils = []
for (const t of towns) {
  const s = JSON.parse(fs.readFileSync(path.join(BAKED, t, 'ground.json'), 'utf8')).stencil ?? null
  const m = bezelModel(s)
  if (s == null) {
    if (m.ok || !m.reason) fail(`${t}: no disc, but the bezel did not refuse with a reason`)
    else pass(`${t}: no disc → refuses ("${m.reason}")`)
    continue
  }
  stencils.push([t, s])
  if (!m.ok) fail(`${t}: has a disc, but the bezel refused: ${m.reason}`)
  else if (m.radius !== s.radius || m.center[0] !== s.center[0] || m.center[1] !== s.center[1]) fail(`${t}: bezel disc ${m.center}/${m.radius} ≠ stencil ${s.center}/${s.radius}`)
  else pass(`${t}: centre [${s.center}] radius ${s.radius} — the town's own`)
}

// ── 3. no town's number is written into the bezel ─────────────────────────────────────────────────
console.log('\n(3) no town\'s radius or centre is a literal in the bezel')
const values = new Map()
for (const [t, s] of stencils) for (const v of [s.radius, ...s.center]) values.set(String(v), t)
for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const hits = [...src.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g)].map((m) => m[0]).filter((n) => values.has(n) && Math.abs(Number(n)) >= 50)
  if (hits.length) fail(`${f} carries ${[...new Set(hits)].map((n) => `${n} (${values.get(n)})`).join(', ')}`)
  else pass(`${f}: no town's number`)
}

// ── authored wins; a bad division refuses ─────────────────────────────────────────────────────────
console.log('\n(4) the Look authors the divisions')
const C = bezelModel({ center: [0, 0], radius: 1000 }, { tickDegrees: 10 })
if (C.ticks.length !== 36) fail(`authored tickDegrees 10 gave ${C.ticks.length} ticks, want 36`)
else pass(`authored tickDegrees 10 → 36 ticks (default ${BEZEL_DEFAULTS.tickDegrees}° → ${360 / BEZEL_DEFAULTS.tickDegrees})`)
for (const bad of [{ tickDegrees: 7 }, { nonsense: 1 }]) {
  let threw = false
  try { bezelModel({ center: [0, 0], radius: 1000 }, bad) } catch { threw = true }
  if (!threw) fail(`authored ${JSON.stringify(bad)} did not throw`)
  else pass(`authored ${JSON.stringify(bad)} throws, naming it`)
}

console.log(`\n${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
