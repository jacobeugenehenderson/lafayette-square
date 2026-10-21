// claims-ground-normals-come-from-the-terrain.mjs — IS THE GROUND LIT BY THE HILL IT IS DRAPED ON, AND DOES EVERY
// DEVICE READ THE SAME HILL?
//
// ⭐ THE INVARIANT (Jacob, 2026-09-24, "yes everywhere"): the ground is drawn on a flat datum and lifted in the vertex
// shader by the town's one height field (BRIEF-the-ground-stands-on-one-field, 2026-10-21). Unless the normal carries
// the field's slope, every hill in every town is displaced and lit as if flat — nothing errors, the map just reads
// painted. This check holds:
//   ⓪ ONE BILINEAR: the shaders' `_terrainRaw`, EVALUATED over a NEAREST texture, returns the CPU sampler's height
//      (terrainCommon.makeElevationSampler) at the same XZ — inside the field and past its edges; the terrain texture
//      is NEAREST-filtered (a Float32 texture filters linearly only with OES_texture_float_linear, so a phone without it
//      would step per cell); and no shader in src samples `uTerrainMap` except through `_terrainRaw`;
//   ① the GLSL normal, EVALUATED on synthetic heightfields: a slope tilts it by the right amount, flat leaves it up,
//      Browse (exag 0) leaves it alone;
//   ② its sample step is ONE GRID STEP of the heightfield — the expectation is a central difference at the grid's own
//      step, on a field fine enough that any other step disagrees (it was `_eps = 5.0` m, right only on a 5 m grid);
//   ③ THE KERB KEEPS ITS OWN SHADING (Boz, 2026-10-21): the normal is COMPOSED with the mesh's own, not replaced — a
//      kerb slope on a hill is lit by the slope it has on the hill (its own tilt plus the field's), and a vertical riser
//      keeps its own normal;
//   ④ every GROUND material asks for it: each `patchTerrain(` call in BakedGround.jsx and gravelPathMaterial.js passes
//      `terrainNormals: true`.
//
// ⭐ READS THE SOURCE: TERRAIN_NORMAL and `_terrainRaw` (in TERRAIN_DECL) are pulled out of src/utils/terrainShader.js
// as text and run, not restated. (The module itself cannot be imported in node — it fetches at load.) The transpile is
// a narrow GLSL→JS rewrite of exactly the constructs those snippets use; a construct it cannot rewrite throws, so a
// rewrite of the snippet cannot slip past as a pass.
//
// ▶ MUTANTS, built in (`--mutants`): each edits the source text this check reads and must turn a section RED —
//     · `float _sx = uSpanX / (uTexW - 1.0);` → `float _sx = 5.0;`        → ② RED
//     · flip the gradient's sign `(_eR - _eL)` → `(_eL - _eR)`             → ① RED
//     · REPLACE instead of compose (the mesh normal dropped)               → ③ RED
//     · `(ix + 0.5) / uTexW` → `(ix) / uTexW` (off the texel centre)       → ⓪ RED
//     · the texture back to LinearFilter                                   → ⓪ RED
//     · drop `terrainNormals: true` from BakedGround's calls               → ④ RED
//
//   node checks/claims-ground-normals-come-from-the-terrain.mjs [--mutants]
// Read-only. Exits 1 when the ground is not lit by its own terrain.
import fs from 'fs'
import { makeElevationSampler } from '../src/lib/terrainCommon.js'

const SRC = 'src/utils/terrainShader.js'
const GROUND = ['src/components/BakedGround.jsx', 'src/components/gravelPathMaterial.js']
const SOURCE = fs.readFileSync(SRC, 'utf8')
const GROUND_SRC = Object.fromEntries(GROUND.map(f => [f, fs.readFileSync(f, 'utf8')]))

const toJS = (glsl) => glsl
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#include') && !/^vec4 _nw = modelMatrix/.test(l))
  .map(l => {
    const js = l.replace(/^(float|vec2|vec3) /, 'let ')
    if (/\b(vec4|mat[234]|ivec|for|while)\b/.test(js)) throw new Error(`⛔ construct this check cannot evaluate: ${l}`)
    return js
  }).join('\n')

function run(src, groundSrc, log) {
  let red = 0
  const bad = (msg) => { red++; log(`   ⛔ ${msg}`) }
  const grab = (name) => {
    const m = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))
    if (!m) throw new Error(`⛔ ${name} not found in ${SRC}`)
    return m[1]
  }
  const NORMAL = grab('TERRAIN_NORMAL'), DECL = grab('TERRAIN_DECL')
  const body = NORMAL.match(/#include <beginnormal_vertex>\s*\{([\s\S]*)\}\s*$/)
  if (!body) throw new Error('⛔ TERRAIN_NORMAL no longer has the `#include <beginnormal_vertex> { … }` shape this check evaluates')
  const rawFn = DECL.match(/float _terrainRaw\(vec2 raw\) \{([\s\S]*?)\n\}/)
  if (!rawFn) throw new Error('⛔ TERRAIN_DECL no longer defines `float _terrainRaw(vec2 raw) { … }`')

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const mix = (a, b, t) => typeof a === 'number' ? a + (b - a) * t : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
  const vec2 = (x, y) => ({ x, y }), vec3 = (x, y, z) => ({ x, y, z })
  const normalize = v => { const L = Math.hypot(v.x, v.y, v.z); return { x: v.x / L, y: v.y / L, z: v.z / L } }
  // a W×H field over [0, spanX]×[0, spanZ], read the way the GPU reads it: NEAREST at the coordinate given. A fetch
  // off a texel's centre is counted: on a texel boundary a real GPU may round either way, so only the centre is one texel.
  let offCentre = 0
  const field = ({ W, H, spanX, spanZ, h }) => {
    const data = new Float32Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data[j * W + i] = h(i * spanX / (W - 1), j * spanZ / (H - 1))
    const texture2D = (_m, uv) => { for (const f of [uv.x * W, uv.y * H]) if (Math.abs(f - Math.floor(f) - 0.5) > 1e-6) offCentre++
      return { r: data[clamp(Math.floor(uv.y * H), 0, H - 1) * W + clamp(Math.floor(uv.x * W), 0, W - 1)] } }
    const U = { uSpanX: spanX, uSpanZ: spanZ, uTexW: W, uTexH: H, uBMinX: 0, uBMinZ: 0, uTerrainMap: null }
    // eslint-disable-next-line no-new-func
    const _terrainRaw = new Function('U', 'texture2D', 'vec2', 'clamp', 'mix', 'floor', 'raw',
      `const { uTexW, uTexH, uTerrainMap } = U;\n${toJS(rawFn[1])}`).bind(null, U, texture2D, vec2, clamp, mix, Math.floor)
    return { data, U, _terrainRaw, terrain: { width: W, height: H, bounds: { minX: 0, maxX: spanX, minZ: 0, maxZ: spanZ }, data } }
  }
  function evalNormal({ W, H = W, span, h, exag = 1, at, on = 1, n0 = { x: 0, y: 1, z: 0 } }) {
    const F = field({ W, H, spanX: span, spanZ: span, h })
    const U = { ...F.U, uExag: exag, uTerrainNormals: on }
    // eslint-disable-next-line no-new-func
    return new Function('U', '_terrainRaw', 'vec2', 'vec3', 'normalize', 'mix', '_nw', 'objectNormal0',
      `const { uSpanX, uSpanZ, uTexW, uTexH, uBMinX, uBMinZ, uExag, uTerrainNormals } = U; let objectNormal = objectNormal0;\n${toJS(body[1])}\nreturn objectNormal`)(
      U, F._terrainRaw, vec2, vec3, normalize, mix, { x: at[0], z: at[1] }, normalize(n0))
  }
  const deg = n => Math.acos(Math.min(1, n.y)) * 180 / Math.PI
  const near = (a, b, tol) => Math.abs(a - b) <= tol

  log('⓪ ONE BILINEAR, ON EVERY DEVICE')
  {
    const F = field({ W: 37, H: 23, spanX: 180, spanZ: 110, h: (x, z) => 3 * Math.sin(x / 13) + 0.02 * x * z - 0.7 * Math.cos(z / 7) })
    const cpu = makeElevationSampler(F.terrain, 1).getElevationRaw
    let worst = 0, n = 0
    for (let k = 0; k < 4000; k++) {
      const x = -20 + (k * 0.61803398875 % 1) * 220, z = -15 + (k * 0.7548776662 % 1) * 140   // in and past the edges
      worst = Math.max(worst, Math.abs(F._terrainRaw({ x: x / 180, y: z / 110 }) - cpu(x, z))); n++
    }
    worst <= 1e-9 ? log(`   ✅ the shader's _terrainRaw = the CPU sampler at ${n} points, in and past the field (worst ${worst.toExponential(1)} m)`)
      : bad(`the shader's _terrainRaw departs from the CPU sampler by up to ${worst.toFixed(4)} m — CPU-placed objects and the drawn ground would disagree`)
    offCentre ? bad(`${offCentre} texel fetch coordinate(s) off a texel's centre — on a boundary the GPU's NEAREST may take either neighbour`)
      : log('   ✅ every fetch lands on a texel centre')
    const tex = src.match(/function makeTerrainTexture[\s\S]*?\n\}/)?.[0] || ''
    ;/magFilter = THREE\.NearestFilter/.test(tex) && /minFilter = THREE\.NearestFilter/.test(tex) && !/LinearFilter/.test(tex)
      ? log('   ✅ the terrain texture is NEAREST-filtered: no device needs float linear filtering')
      : bad('the terrain texture is not NEAREST-filtered — a Float32 texture filters linearly only with OES_texture_float_linear; a phone without it steps per cell')
    const strays = []
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`
      if (e.isDirectory()) walk(p); else if (/\.(m?js|jsx)$/.test(e.name)) {
        const t = p === SRC ? src.replace(rawFn[0], '') : fs.readFileSync(p, 'utf8')
        if (/texture2D\(\s*uTerrainMap/.test(t)) strays.push(p) } } }
    walk('src')
    strays.length ? bad(`uTerrainMap sampled outside _terrainRaw (the hardware filter, which steps on a NEAREST texture): ${strays.join(', ')}`)
      : log('   ✅ every shader reads the field through _terrainRaw')
  }

  log('① THE GLSL NORMAL, EVALUATED')
  {
    const flat = evalNormal({ W: 65, span: 640, h: () => 3, at: [320, 320] })
    near(flat.y, 1, 1e-9) ? log('   ✅ flat field → up') : bad(`flat field tilted: ${JSON.stringify(flat)}`)
    const g = 0.25   // rises 0.25 m per m eastward → 14.04°, normal leans WEST (−x)
    const ramp = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320] })
    const want = Math.atan(g) * 180 / Math.PI
    near(deg(ramp), want, 0.01) && ramp.x < 0 && near(ramp.z, 0, 1e-9)
      ? log(`   ✅ 0.25 m/m ramp → ${deg(ramp).toFixed(2)}° from up, leaning downhill`)
      : bad(`ramp normal ${JSON.stringify(ramp)} — want ${want.toFixed(2)}° leaning −x`)
    const rampZ = evalNormal({ W: 65, span: 640, h: (_x, z) => g * z, at: [320, 320] })
    near(deg(rampZ), want, 0.01) && rampZ.z < 0 ? log('   ✅ same ramp along z → leans −z') : bad(`z-ramp normal ${JSON.stringify(rampZ)}`)
    const x2 = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], exag: 2 })
    near(deg(x2), Math.atan(2 * g) * 180 / Math.PI, 0.01) ? log('   ✅ exag 2 doubles the slope the light sees') : bad(`exag 2 → ${deg(x2).toFixed(2)}°`)
    const browse = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], exag: 0 })
    near(browse.y, 1, 1e-9) ? log('   ✅ exag 0 (flat Browse map) → geometry normal kept') : bad('exag 0 tilted the normal')
    // The eye-gate A/B: at 0 the geometry normal, at 1 the terrain's — and it SHIPS at 1.
    const ab = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], on: 0 })
    near(ab.y, 1, 1e-9) ? log('   ✅ uTerrainNormals 0 → geometry normal (the A/B\'s "before")') : bad('uTerrainNormals 0 still tilts')
    ;/uTerrainNormals:\s*\{\s*value:\s*1\s*\}/.test(src) ? log('   ✅ uTerrainNormals ships at 1') : bad('uTerrainNormals does not ship at 1 — the ground would render lit as flat')
  }

  log('② THE STEP IS THE GRID\'S OWN')
  for (const step of [1, 2, 10]) {
    // a ripple of wavelength 4 grid steps: a central difference at ±1 step reads it exactly on the samples; at any
    // other step it reads a different slope.
    const W = 129, span = step * (W - 1), lam = 4 * step, A = 0.3 * step
    const h = (x) => A * Math.sin(2 * Math.PI * x / lam)
    const x = 60 * step
    const expect = -(h(x + step) - h(x - step)) / (2 * step)
    const n = evalNormal({ W, span, h, at: [x, span / 2] })
    near(n.x / n.y, expect, 1e-6) ? log(`   ✅ ${step} m grid: slope read at ±${step} m`) : bad(`${step} m grid: normal reads slope ${(n.x / n.y).toFixed(4)}, the grid step gives ${expect.toFixed(4)} — the sample step is not this grid's`)
  }
  if (/\b\d+\.\d+\b/.test(NORMAL.replace(/\b(0\.0|1\.0|2\.0)\b/g, ''))) bad('TERRAIN_NORMAL carries a numeric literal beyond 0.0/1.0/2.0 — a metre constant in the normal')

  log('③ THE KERB KEEPS ITS OWN SHADING (composed, not replaced)')
  {
    const g = 0.1, s = 0.3   // the hill rises 0.1 m/m east; a kerb slope rises 0.3 m/m east, or north
    const along = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], n0: { x: -s, y: 1, z: 0 } })
    near(along.x / along.y, -(s + g), 1e-9) && near(along.z, 0, 1e-9)
      ? log(`   ✅ a kerb slope with the hill → lit by ${(s + g).toFixed(2)} m/m, its own plus the field's`)
      : bad(`a kerb slope on the hill reads ${(-along.x / along.y).toFixed(4)} m/m, want ${(s + g).toFixed(4)} — the mesh's own slope is not kept`)
    const across = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], n0: { x: 0, y: 1, z: -s } })
    near(across.x / across.y, -g, 1e-9) && near(across.z / across.y, -s, 1e-9)
      ? log('   ✅ a kerb slope across the hill → the field\'s slope one way, its own the other')
      : bad(`a kerb slope across the hill reads (${(-across.x / across.y).toFixed(4)}, ${(-across.z / across.y).toFixed(4)}), want (${g}, ${s})`)
    const riser = evalNormal({ W: 65, span: 640, h: (x) => g * x, at: [320, 320], n0: { x: 0, y: 0, z: 1 } })
    near(riser.z, 1, 1e-9) ? log('   ✅ a vertical riser keeps its own normal') : bad(`a vertical riser's normal became ${JSON.stringify(riser)}`)
  }

  log('④ EVERY GROUND MATERIAL ASKS FOR IT')
  for (const f of GROUND) {
    const code = groundSrc[f].replace(/\/\/.*$/gm, '')
    const calls = [...code.matchAll(/patchTerrain\(([^)]*)\)/g)].map(m => m[1])
    if (!calls.length) { bad(`${f}: no patchTerrain call at all`); continue }
    const missing = calls.filter(c => !/terrainNormals:\s*true/.test(c))
    missing.length ? bad(`${f}: ${missing.length}/${calls.length} patchTerrain call(s) without terrainNormals: true`) : log(`   ✅ ${f}: ${calls.length} call(s)`)
  }
  return red
}

const red = run(SOURCE, GROUND_SRC, console.log)
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')

if (process.argv.includes('--mutants')) {
  const swap = (s, a, b) => { if (!s.includes(a)) throw new Error(`⛔ mutant site gone: ${a}`); return s.replace(a, b) }
  const M = [
    ['the step a 5 m constant', () => [swap(SOURCE, 'float _sx = uSpanX / (uTexW - 1.0);', 'float _sx = 5.0;'), GROUND_SRC]],
    ['the gradient\'s sign flipped', () => [swap(SOURCE, '(_eR - _eL)', '(_eL - _eR)'), GROUND_SRC]],
    ['the normal replaced, not composed', () => [swap(SOURCE, 'vec3 _tn = normalize(vec3(objectNormal.x - _h.x * objectNormal.y, objectNormal.y, objectNormal.z - _h.y * objectNormal.y));',
      'vec3 _tn = normalize(vec3(-_h.x, 1.0, -_h.y));'), GROUND_SRC]],
    ['the fetch off the texel centre', () => [swap(SOURCE, 'float u0 = (ix + 0.5) / uTexW', 'float u0 = (ix) / uTexW'), GROUND_SRC]],
    ['the texture back to linear', () => [swap(SOURCE, 'tex.magFilter = THREE.NearestFilter', 'tex.magFilter = THREE.LinearFilter'), GROUND_SRC]],
    ['BakedGround without terrainNormals', () => [SOURCE, { ...GROUND_SRC, [GROUND[0]]: GROUND_SRC[GROUND[0]].replace(/terrainNormals:\s*true/g, 'terrainNormals: false') }]],
  ]
  let survived = 0
  for (const [name, mk] of M) {
    const [s, g] = mk()
    let r; try { r = run(s, g, () => {}) } catch (e) { r = 1 }
    if (r) console.log(`   ✅ mutant RED: ${name}`); else { survived++; console.log(`   ⛔ mutant SURVIVED: ${name}`) }
  }
  console.log(survived ? `⛔ ${survived} mutant(s) survived — this check cannot see them` : '✅ every mutant is caught')
  if (survived) process.exit(1)
}
process.exit(red ? 1 : 0)
