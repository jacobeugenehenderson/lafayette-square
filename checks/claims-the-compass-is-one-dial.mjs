// claims-the-compass-is-one-dial.mjs — ONE compass, one look, and none of it is a town's (BRIEF-compass-bezel).
//
// ⭐ THE CLAIM (Jacob, 2026-09-28: "a maxi compass around the part of the map we're looking at"):
//   (1) ONE DIAL. The phone's ring round the map and Street's badge are the SAME drawing (BezelDial) at two sizes, and
//       nothing is drawn on the ground: the rim ticks, the bezel band and the 🔺 texture are gone and must stay gone.
//   (2) NO TOWN IN IT. The model takes the Look's authored block only — no stencil, no radius, no ground — and every
//       size is a fraction of the dial's own radius (rim = 1), every spacing an angle.
//   (3) WHERE IT SHOWS IS THE APP'S LAYOUT. The ring and the badge mount only where the app's own `when` media query
//       (its narrow layout) matches — one gate for both; the kit carries no breakpoint and never reads a user-agent.
//   (4) The model's own rules: the Look authors the divisions (a bad one throws), only N carries the mark (apex on the
//       rim), the night lifts the colour and never dims it, an authored colour is its own night colour.
// Read from the source; nothing is restated.   ▶ node checks/claims-the-compass-is-one-dial.mjs
import fs from 'fs'
import { bezelModel, BEZEL_DEFAULTS, nightGlowAt, colorPair } from '../src/lib/compassBezel.js'

const JSX = 'src/components/CompassBezel.jsx', MODEL = 'src/lib/compassBezel.js'
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const jsx = strip(fs.readFileSync(JSX, 'utf8')), model = strip(fs.readFileSync(MODEL, 'utf8'))
let failures = 0
const fail = (m) => { failures++; console.log(`  ✗ ${m}`) }
const pass = (m) => console.log(`  ✓ ${m}`)

console.log('\n(1) one dial, nothing on the ground')
const ground = [/<mesh\b/, /<instancedMesh\b/, /MeshBasicMaterial/, /BufferGeometry/, /CanvasTexture/, /<Text\b/].filter((re) => re.test(jsx))
if (ground.length) fail(`${JSX} still draws in the scene: ${ground.map(String).join(' ')}`)
else pass('nothing in the 3D scene — the rim ticks, band and 🔺 texture are gone')
const dials = (jsx.match(/<BezelDial\b/g) || []).length, planDial = /shot === 'plan'[\s\S]{0,120}<Dial\b/.test(jsx), streetDial = /shot === 'street'[\s\S]{0,120}<Dial\b/.test(jsx)
if (dials !== 1 || !planDial || !streetDial) fail(`BezelDial drawn ${dials}× (want 1, via Dial), plan→Dial ${planDial}, street→Dial ${streetDial}`)
else pass('plan and Street both draw the one BezelDial, through Dial')

console.log('\n(2) no town in it')
// `radius` as a READ (x.radius, { radius }, radius:) — not an SVG attribute like feMorphology's radius={…}.
const townReads = [/stencil/, /ground\.json/, /\.radius\b|[{,]\s*radius\b|\bradius\s*:/, /ASSET_BASE/, /getElevation/].filter((re) => re.test(model) || re.test(jsx))
if (townReads.length) fail(`the compass reads town data: ${townReads.map(String).join(' ')}`)
else pass('no stencil, radius, ground or slab read in the model or the component')
const A = bezelModel()
const outOfUnit = [...A.ticks.flatMap((t) => [t.inner, t.outer]), A.north.r + A.north.size / 2, A.face.inner, A.face.outer].filter((v) => !(v > 0 && v <= 1 + 1e-9))
if (outOfUnit.length) fail(`${outOfUnit.length} size(s) outside the unit dial: ${outOfUnit.slice(0, 4).join(', ')}`)
else pass(`${A.ticks.length} ticks, the mark and the face all inside the unit dial (rim = 1)`)

console.log('\n(3) the compass shows where the APP says it is narrow — and nowhere else')
if (/const HANDHELD|'\(max-width|'\(min-width|\d+rem|\d+px\)/.test(jsx)) fail('the kit carries a breakpoint of its own — "narrow" must be the app\'s `when`')
else if (/userAgent|navigator\.platform|maxTouchPoints/.test(jsx)) fail('the device is sniffed')
else if (!/typeof when !== 'string'[\s\S]{0,80}throw/.test(jsx)) fail('a compass with no `when` does not refuse')
else if (!/if \(!model \|\| !narrow \|\| shot === 'movie'\) return null/.test(jsx)) fail('the compass is not gated, once, on the app\'s `when` before either shot')
else pass('plan ring and Street badge only where the app\'s `when` matches — no kit breakpoint, no user-agent, refuses without it')

// The kit inscribes the dial in the viewport ONLY when the app asks for it (`at: 'fill'`).
if (/Math\.min\(size\.width,\s*size\.height\)/.test(jsx) && !/const px = fill \? Math\.min\(size\.width,\s*size\.height\)/.test(jsx)) fail('the kit sizes the dial to the viewport on its own — only `at: \'fill\'` may')
else if (!/throw new Error\(`\[CompassBezel\] ⛔ dial/.test(jsx)) fail('a dial with no placement does not refuse')
else pass('size and place are the app\'s `dial` (fill, top-center, or an edge) — a dial without one refuses')

console.log('\n(4) the model')
const C = bezelModel({ tickDegrees: 10 })
if (C.ticks.length !== 35) fail(`authored tickDegrees 10 gave ${C.ticks.length} ticks, want 35 (36 less N's mark)`)
else pass(`authored tickDegrees 10 → 35 ticks + N's mark (default ${BEZEL_DEFAULTS.tickDegrees}° → ${A.ticks.length} + mark)`)
for (const bad of [{ tickDegrees: 7 }, { nonsense: 1 }, { nightGlow: 0.5 }, { color: 42 }]) {
  let threw = false
  try { bezelModel(bad) } catch { threw = true }
  if (!threw) fail(`authored ${JSON.stringify(bad)} did not throw`)
  else pass(`authored ${JSON.stringify(bad)} throws, naming it`)
}
if (A.ticks.some((t) => t.bearing === 0)) fail('a tick is drawn at north as well as the mark')
else if (A.north.bearing !== 0 || Math.abs(A.north.r + A.north.size / 2 - 1) > 1e-9 || A.north.glyph !== BEZEL_DEFAULTS.northMark) fail(`the north mark is not N's one glyph with its apex on the rim (${JSON.stringify(A.north)})`)
else pass(`N carries ${A.north.glyph} (apex on the rim); ${[...new Set(A.ticks.map((t) => t.kind))].join(' · ')} ticks elsewhere`)
const day = nightGlowAt(0.5, 2.2), dusk = nightGlowAt(-3 * Math.PI / 180, 2.2), night = nightGlowAt(-0.5, 2.2)
const sp = colorPair('#123456'), pp = colorPair({ day: '#111111', night: '#222222' })
if (day !== 1 || !(dusk > 1 && dusk < 2.2) || night !== 2.2) fail(`night glow ${day} / ${dusk} / ${night}`)
else if (sp.day !== sp.night || pp.night !== '#222222') fail('an authored colour must be its own night colour; a pair keeps its night')
else pass(`glow 1 by day → ${dusk.toFixed(2)} at −3° → ${night} at night, for any colour`)

console.log(`\n${failures === 0 ? '✅ PASS' : `❌ ${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
