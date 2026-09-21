// claims-water-scales-with-its-body.mjs — DOES THE WATER KNOW HOW BIG IT IS?
//
// ⭐ THE INVARIANT, and it exists because this defect CANNOT BE SEEN TO FAIL:
// the water shader's wave frequencies must be derived from the FEATURE'S OWN
// EXTENT, never from a constant. The constants were tuned by eye on a 105.7 m
// pond — a noise cell every ~8 m, about 12 cells across the body. Hand the same
// constants to an 11.8 km Great Lake and it is ~1,400 cells across, which at any
// camera distance resolves to sub-pixel grey shimmer: FLAT PLASTIC.
// ⛔ Nothing errors. Nothing logs. The lake renders, and it renders wrong. That
// is the kit's signature failure — a plausible-looking success — and it is worst
// on exactly the town nobody has looked at yet.
//
// ⭐⭐ AND THE MIRROR-IMAGE DEFECT, WHICH IS THE ONE THAT SHIPPED: the same knob
// scaling something that must NOT scale. `uWaveK` used to multiply EVERY octave,
// so a big lake had NO SMALL WAVES — huron's finest detail was a 43 m blob and
// the surface read as dead. ⛔ WAVELET SIZE DOES NOT SCALE WITH THE BODY. Lake
// Erie has the same centimetre-to-metre capillary waves a farm pond has; fetch
// buys bigger SWELL on top, it does not delete the small stuff. Only the SWELL's
// wavelength may scale. ⇒ this check asserts BOTH directions: the swell scales,
// the glitter does not, and the drift is a real speed in m/s.
//
// ⭐ THIS CHECK READS THE SOURCE, it does not restate it: it imports the real
// `waveKForExtent`, the real octave table and the real material factory, and it
// EMITS THE SHADER and reads the numbers back out of the GLSL. There is no second
// copy of the law here to drift.
//
// ▶ MUTATION-TEST IT (a passing check proves nothing until seen to fail):
//     · make waveKForExtent return a constant (e.g. `return 1`) — cases 1–2 go RED
//     · multiply the glitter octave's `q` by uWaveK in GLITTER_GLSL — cases 6–7 go RED
//     · replace an octave's drift with a bare constant — case 8 goes RED
//   Put each back.
//
//   node checks/claims-water-scales-with-its-body.mjs
// Read-only. Exits 1 on a water surface that cannot tell a pond from a lake.
import fs from 'fs'
import { waveKForExtent, makeWaterMaterial, GLITTER_OCTAVES, phaseSpeed,
         coxMunkSlopeVariance, slopeScaleForWind } from '../src/components/waterMaterial.js'

const SRC = 'src/components/waterMaterial.js'
const src = fs.readFileSync(SRC, 'utf8')
const fail = []
const ok = []

// ── 1. THE LAW IS EXTENT-DEPENDENT AT ALL ────────────────────────────────────
// Two bodies two orders of magnitude apart must not be given the same waves.
const POND = 105.7        // the LS pond's bbox diagonal — the calibration anchor
const LAKE = 11_776       // huron's Lake Erie ring, measured from clean/map.json
const kPond = waveKForExtent(POND)
const kLake = waveKForExtent(LAKE)
if (!(kLake < kPond)) {
  fail.push(`⛔ the wave scale does not shrink with the body: k(pond ${POND} m) = ${kPond}, ` +
            `k(lake ${LAKE} m) = ${kLake}. A constant here is the silent-plastic regression.`)
} else {
  ok.push(`wave scale shrinks with extent: k(${POND} m) = ${kPond.toFixed(4)} → k(${LAKE} m) = ${kLake.toFixed(4)}`)
}

// ── 2. IT IS MONOTONIC, NOT MERELY DIFFERENT ─────────────────────────────────
// A law that happens to differ at two sample points but wanders in between is
// not a law. Walk a decade of extents and require it to descend the whole way.
let prev = Infinity, monotonic = true
for (let d = 50; d <= 20000; d *= 1.4) {
  const k = waveKForExtent(d)
  if (!(k < prev)) { monotonic = false; break }
  prev = k
}
if (!monotonic) fail.push('⛔ waveKForExtent is not monotonic in extent — it is not a scale law.')
else ok.push('waveKForExtent descends monotonically from 50 m to 20 km')

// ── 3. THE ANCHOR HOLDS — WHICH IS HOW THE CONTROL STAYS THE CONTROL ─────────
// ⛔ LS's pond must come out unchanged by the extraction. Its every frequency is
// `constant × uWaveK`, so "unchanged" reduces to exactly one claim: k == 1 at the
// extent the constants were tuned at. If this drifts, the one surface an operator
// already knows by eye has moved.
if (Math.abs(kPond - 1) > 1e-9) {
  fail.push(`⛔ k at the calibration extent (${POND} m) is ${kPond}, not 1. Every frequency on the ` +
            `pond the constants were tuned on has shifted — the lift is no longer faithful.`)
} else {
  ok.push(`k == 1 at the ${POND} m calibration extent — the tuned surface is unmoved`)
}

// ── 4. NO SCENE LITERAL IN THE KIT MATERIAL ──────────────────────────────────
// The §4① regression: the good shader was welded to one mould once already.
const SCENE_LITERALS = /\b(lafayette|lafayette-square|huron|altadena|hipointe|demun|park_water)\b/i
for (const [i, line] of src.split('\n').entries()) {
  // The header cites `LafayettePark.jsx` as provenance — a comment naming where
  // the code CAME FROM is not a dependency on it. Only code lines are in scope.
  const code = line.split('//')[0]
  if (SCENE_LITERALS.test(code) && !/^\s*\*/.test(line)) {
    fail.push(`⛔ ${SRC}:${i + 1} names a scene in code — the kit material must not know which town it is in:\n      ${line.trim()}`)
  }
}
if (!fail.some(f => f.includes('names a scene'))) ok.push('no scene literal reaches the kit material\'s code')

// ── 5. THE EXTENT IS REQUIRED, LOUDLY ────────────────────────────────────────
// ⛔ NO FALLBACKS. A missing extent must not quietly become a pond.
let threw = false
try { makeWaterMaterial({}) } catch { threw = true }
if (!threw) fail.push('⛔ makeWaterMaterial() accepts a missing extentDiag — it will render a lake at a pond\'s scale, silently.')
else ok.push('makeWaterMaterial refuses a missing extent instead of defaulting to one')

// ── 6-9. THE GLITTER OCTAVES DO NOT SCALE ────────────────────────────────────
// ⭐ Emit the real shader at two extents two orders of magnitude apart and read
// the numbers back out of the GLSL. Nothing here restates the octave table.
const emit = (extentDiag) => {
  const { material } = makeWaterMaterial({ extentDiag })
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_begin>',
  }
  material.onBeforeCompile(shader)
  return shader
}
const shPond = emit(POND), shLake = emit(LAKE)
const glitterOf = (sh) => {
  // ⛔ Anchored on `return s;` — a lazy match to the first `}` stops at the end of
  // octave 0 and silently reports one octave where there are three. (It did, on
  // the first run; the guard said it was blind instead of passing, which is the
  // only acceptable behaviour for a parse that misses.)
  const m = sh.fragmentShader.match(/vec2 wGlitterSlope\(vec2 pw\)[\s\S]*?\n       \}/)
  if (!m) throw new Error('⛔ could not find wGlitterSlope in the emitted shader — the guard is blind; fix the parse before trusting a PASS')
  return m[0]
}
const gPond = glitterOf(shPond), gLake = glitterOf(shLake)

if (gPond !== gLake) {
  fail.push(`⛔ the GLITTER octaves differ between a ${POND} m pond and a ${LAKE} m lake. Wavelet size must NOT ` +
            `scale with the body — a Great Lake has the same small waves a pond has. Only the swell may scale.`)
} else {
  ok.push('the glitter octaves are byte-identical at pond and lake scale — same small waves in every town')
}
if (/uWaveK/.test(gPond)) {
  fail.push('⛔ uWaveK appears inside wGlitterSlope. That is the "a big lake has no small waves" regression, ' +
            'and it is invisible: the lake still renders, with its finest detail 40 m across.')
} else {
  ok.push('uWaveK does not reach the glitter stack')
}

// ── 8. DRIFT IS A SPEED IN METRES PER SECOND, not a shader-space constant ─────
// ⛔ THE UNIT IS THE DEFECT. A time term added to an already-rescaled coordinate
// made the old period accidentally scale-free at 79 s in every town. Each
// octave's emitted velocity must have the magnitude physics gives it: c = √(gL/2π).
// ⭐ The direction is now a UNIFORM (the town's live wind bearing) and only the
// SPEED is emitted — which is the half that must be in m/s.
const vels = [...gPond.matchAll(/d \* ([\d.]+) \* uTime/g)].map(m => parseFloat(m[1]))
if (vels.length !== GLITTER_OCTAVES.length) {
  fail.push(`⛔ parsed ${vels.length} drift velocities from the emitted glitter stack but the table has ` +
            `${GLITTER_OCTAVES.length} octaves — the guard is blind; fix the parse before trusting a PASS.`)
} else {
  for (const [i, o] of GLITTER_OCTAVES.entries()) {
    const want = phaseSpeed(o.lambdaM)
    if (Math.abs(vels[i] - want) > 1e-3) {
      fail.push(`⛔ octave ${i} (${o.lambdaM} m) drifts at ${vels[i].toFixed(3)} m/s; its deep-water phase speed ` +
                `is ${want.toFixed(3)} m/s. A drift that is not a speed means a different real thing in every town.`)
    }
  }
  if (!fail.some(f => f.includes('drifts at'))) {
    ok.push(`all ${vels.length} glitter octaves drift at their own phase speed ` +
            `(${GLITTER_OCTAVES.map(o => phaseSpeed(o.lambdaM).toFixed(2)).join(', ')} m/s)`)
  }
}

// ── 9. THE WAVELENGTHS REACHING THE GPU ARE THE TABLE'S, IN METRES ───────────
const invLs = [...gPond.matchAll(/\*\s*([\d.]+);\n\s*float hx/g)].map(m => parseFloat(m[1]))
for (const [i, o] of GLITTER_OCTAVES.entries()) {
  const want = 1 / o.lambdaM
  if (invLs[i] === undefined || Math.abs(invLs[i] - want) > 1e-4) {
    fail.push(`⛔ octave ${i} reaches the GPU at ${invLs[i]} cycles/m; the table says ${o.lambdaM} m ` +
              `(${want.toFixed(6)} cycles/m). The seam is not converting metres.`)
  }
}
if (!fail.some(f => f.includes('cycles/m'))) {
  ok.push(`glitter wavelengths reach the GPU in metres: ${GLITTER_OCTAVES.map(o => o.lambdaM + ' m').join(', ')}`)
}

// ── 10. AND THE SWELL STILL DOES SCALE — the other half of the invariant ─────
// ⛔ Both halves matter. Freezing the swell too would be the opposite bug: one
// wave size for a pond and a Great Lake.
if (!/wpWorld \* uWaveK/.test(shPond.fragmentShader)) {
  fail.push('⛔ the swell no longer reads from `wpWorld * uWaveK` — the body\'s own long wave has stopped ' +
            'scaling with the body, which is the opposite bug and just as invisible.')
} else {
  ok.push('the swell still scales with the body (wpWorld * uWaveK)')
}

// ── 11. THE SURFACE IS AS ROUGH AS THE REAL OCEAN ────────────────────────────
// ⛔ THE REGRESSION THIS CATCHES IS "THE LAKE IS MATTE AT NOON", and it is a
// REQUIREMENT, not a taste: Jacob, 2026-09-20 — "we should have *some* level of
// glint across the whole body, at least at the height of the sun."
// ⭐ The width of the glitter region IS the slope variance, so a matte body is a
// variance that is too low. Measured before the fix: 0.00818 — by Cox & Munk a
// surface under ~1 m/s of wind (RMS slope 5.2°), i.e. permanently near-calm in
// every town whatever the weather was doing. ⇒ assert the field lands on
// Cox–Munk, by SAMPLING it, not by trusting the normalisation that produced it.
{
  const fract = (x) => x - Math.floor(x)
  const hash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453)
  const sm = (f) => f * f * (3 - 2 * f)
  const noise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z)
    const fx = sm(x - ix), fz = sm(z - iz)
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1)
    const lo = a + (b - a) * fx, hi = c + (d - c) * fx
    return lo + (hi - lo) * fz
  }
  // ⛔ A DIFFERENT SAMPLE SET than the one the module normalised with — otherwise
  // this only proves the arithmetic, not that the estimate converged.
  for (const W of [0, 2, 5, 8, 12]) {
    const scale = slopeScaleForWind(W)
    let sum2 = 0, N = 6000
    for (let i = 0; i < N; i++) {
      const px = (i * 11.17 + 91.3) % 2500, pz = (i * 5.29 + 17.7) % 2500
      let sx = 0, sz = 0
      for (const o of GLITTER_OCTAVES) {
        const qx = px / o.lambdaM, qz = pz / o.lambdaM
        sx += (noise(qx + 0.5, qz) - noise(qx - 0.5, qz)) * o.steep
        sz += (noise(qx, qz + 0.5) - noise(qx, qz - 0.5)) * o.steep
      }
      sum2 += (sx * sx + sz * sz) * scale * scale
    }
    const got = sum2 / N, want = coxMunkSlopeVariance(W)
    if (Math.abs(got - want) / want > 0.15) {
      fail.push(`⛔ at ${W} m/s the surface's slope variance samples to ${got.toFixed(5)}, but Cox & Munk ` +
                `(sigma² = 0.003 + 0.00512·W) says ${want.toFixed(5)}. Too low reads MATTE at high sun, which is a ` +
                `stated requirement failure; too high reads as sandpaper.`)
    }
  }
  if (!fail.some(f => f.includes('Cox & Munk'))) {
    ok.push(`slope variance lands on Cox & Munk across 0–12 m/s (RMS slope ` +
            `${[0, 5, 12].map(W => (Math.atan(Math.sqrt(coxMunkSlopeVariance(W))) * 180 / Math.PI).toFixed(1) + '°').join(' · ')})`)
  }
}

// ── 12. AND `glint` STILL MEANS A MULTIPLE OF THAT PHYSICAL SURFACE ──────────
// ⭐ 1 = the real ocean; 0 = the exact pre-glint control, which is the falsifiable
// end of the knob and worth more than any number of siblings.
{
  const { uniforms } = makeWaterMaterial({ extentDiag: POND })
  if (uniforms.uGlint.value !== 1) {
    fail.push(`⛔ the default glint is ${uniforms.uGlint.value}, not 1. The knob's unit is "multiples of the ` +
              `physically correct slope", so any default but 1 ships water that is deliberately not water.`)
  } else {
    ok.push('glint defaults to 1 — the physical surface, with 0 still the exact flat control')
  }
}

// ── THE EMITTED SHADER MUST COMPILE — NO DECLARATION TWICE ───────────────────
// ⛔⛔ THE BUG THIS EXISTS FOR, AND IT COST AN ENTIRE EVENING. A rewrite left the
// OLD glitter block in the source below the new one, so the emitted fragment
// shader declared `wH`, `wAlign` and `wSparkle` twice:
//     ERROR: 0:2212: 'wH' : redefinition
//     Fragment shader is not compiled.  VALIDATE_STATUS false
// ⭐ The material existed. The mesh was in the tree. The geometry was right. The
// program NEVER LINKED, so nothing drew — and "no water, all skydome" was read as
// a missing mesh, a wrong renderer, a camera angle and a Fresnel limit, in that
// order, across four rounds. ⛔ NONE of those could ever have been fixed, because
// the shader was not running.
// ⚠️ AND THE GATE THAT SHOULD HAVE CAUGHT IT: every verification I ran said
// "module LOADS ✓" and "term present ✓". A term being PRESENT says nothing about
// it being present ONCE. Uniqueness is the property that matters for a string-
// patched shader, and nothing was asserting it.
{
  const sh = emit(LAKE)
  const dupes = []
  // Every local this material declares in the fragment main(). A GLSL redefinition
  // is a hard compile error, so one duplicate kills the whole surface.
  // ⚠️ SCOPED BY INDENTATION, deliberately. A first version counted EVERY
  // declaration and cried wolf on `q`, `hx`, `hz` — which are declared once per
  // octave inside their own `{ }` blocks, where GLSL allows it. Only the
  // material's own main-body locals (7- and 9-space indents, the two levels this
  // file emits into main()) can actually collide.
  const names = [...sh.fragmentShader.matchAll(/^( {7}| {9})(?:vec[234]|float|int) (\w+) =/gm)].map(m => m[2])
  for (const decl of names) {
    const n = names.filter(x => x === decl).length
    if (n > 1 && !dupes.includes(decl)) dupes.push(`${decl} ×${n}`)
  }
  // ⛔⛔ HONEST LABEL: I COULD NOT MAKE THIS ONE FAIL ON DEMAND. Duplicating the
  // `wH` declaration in the source did not trip it, so by this project's own rule
  // — a check is not a check until it has been SEEN TO FAIL — this assertion is
  // NOT YET TRUSTWORTHY. It is kept because the bug it targets cost an evening and
  // a partial guard beats none, but ⚠️ DO NOT READ ITS GREEN AS EVIDENCE. The
  // reliable guard against this bug is the one below it (idempotence), which IS
  // mutation-tested, plus the browser console: a redefinition prints
  // `VALIDATE_STATUS false` and names the line.
  if (dupes.length) {
    fail.push(`⛔ the emitted fragment shader declares the same name more than once: ${dupes.join(', ')}. ` +
              `GLSL treats that as a redefinition ERROR — the program will not link and the water will draw NOTHING, ` +
              `silently, looking exactly like a missing mesh.`)
  } else {
    ok.push('every declaration in the emitted shader is unique (⚠️ assertion not mutation-proven — see note)')
  }
  // And the patching must be idempotent: three may call onBeforeCompile against an
  // already-patched shader, and every patch here re-emits the #include it matched.
  const { material } = makeWaterMaterial({ extentDiag: LAKE })
  const twice = { uniforms: {}, vertexShader: sh.vertexShader, fragmentShader: sh.fragmentShader }
  material.onBeforeCompile(twice)
  const wh = (twice.fragmentShader.match(/vec3 wH = normalize/g) || []).length
  if (wh > 1) {
    fail.push(`⛔ onBeforeCompile is NOT idempotent — a second call re-patched an already-patched shader ` +
              `(${wh} copies of the glitter block). Same redefinition failure, arriving nondeterministically.`)
  } else {
    ok.push('onBeforeCompile is idempotent — a second pass cannot double-patch')
  }
}

for (const line of ok) console.log(`  ✅ ${line}`)
if (fail.length) {
  console.error('\n' + fail.join('\n'))
  console.error(`\n⛔ ${fail.length} failure(s) — water that cannot tell a pond from a lake.`)
  process.exit(1)
}
console.log(`\n✅ the water surface derives its waves from its own body.`)
