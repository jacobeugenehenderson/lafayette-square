// claims-ground-normals-come-from-the-terrain.mjs — IS THE GROUND LIT BY THE HILL IT IS DRAPED ON?
//
// ⭐ THE INVARIANT (Jacob, 2026-09-24, "yes everywhere"): the baked ground is flat and
// lifted in the vertex shader, so its geometry normals point UP. Unless the normal is
// taken from the heightfield, every hill in every town is displaced and lit as if flat
// — nothing errors, the map just reads painted. This check holds three things:
//   ① the GLSL normal, EVALUATED on synthetic heightfields: a slope tilts it by the
//      right amount, flat leaves it up, Browse (exag 0) leaves it alone;
//   ② its sample step is ONE GRID STEP of the heightfield — the check's expectation is
//      a central difference at the grid's own step, on a field fine enough that any
//      other step disagrees (it was `_eps = 5.0` m, right only on a 5 m grid);
//   ③ every GROUND material asks for it: each `patchTerrain(` call in BakedGround.jsx
//      and gravelPathMaterial.js passes `terrainNormals: true`.
//
// ⭐ READS THE SOURCE: TERRAIN_NORMAL and _terrainUV are pulled out of
// src/utils/terrainShader.js as text and run, not restated. (The module itself cannot
// be imported in node — it top-level-awaits a fetch.) The transpile is a narrow GLSL→JS
// rewrite of exactly the constructs that snippet uses; a construct it cannot rewrite
// throws, so a rewrite of the snippet cannot slip past as a pass.
//
// ▶ MUTATION-TEST IT (a passing check proves nothing until seen to fail):
//     · in TERRAIN_NORMAL, `float _sx = uSpanX / (uTexW - 1.0);` → `float _sx = 5.0;`   → ② RED
//     · flip a sign: `(_eL - _eR)` → `(_eR - _eL)`                                     → ① RED
//     · drop `terrainNormals: true` from one patchTerrain call in BakedGround.jsx        → ③ RED
//   Put each back.
//
//   node checks/claims-ground-normals-come-from-the-terrain.mjs
// Read-only. Exits 1 when the ground is not lit by its own terrain.
import fs from 'fs'

const SRC = 'src/utils/terrainShader.js'
const src = fs.readFileSync(SRC, 'utf8')
const grab = (name) => {
  const m = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\``))
  if (!m) throw new Error(`⛔ ${name} not found in ${SRC}`)
  return m[1]
}
let red = 0
const bad = (msg) => { red++; console.log(`   ⛔ ${msg}`) }

// ── the GLSL, as JS ─────────────────────────────────────────────────────────
const NORMAL = grab('TERRAIN_NORMAL')
const body = NORMAL.match(/if \(uExag > 0\.01\) \{([\s\S]*)\}\s*$/)
if (!body) throw new Error('⛔ TERRAIN_NORMAL no longer has the `if (uExag > 0.01) { … }` shape this check evaluates')
const toJS = (glsl) => glsl
  .split('\n').map(l => l.trim()).filter(l => l && !/^vec4 _nw = modelMatrix/.test(l))
  .map(l => {
    const js = l.replace(/^(float|vec2|vec3) /, 'let ')
    if (/\b(vec4|mat[234]|ivec|for|while)\b/.test(js)) throw new Error(`⛔ construct this check cannot evaluate: ${l}`)
    return js
  }).join('\n')
const DECL = grab('TERRAIN_DECL')
if (!/raw\.x \* \(uTexW - 1\.0\) \+ 0\.5\) \/ uTexW/.test(DECL)) bad('_terrainUV no longer maps u → (u·(N−1)+0.5)/N; this check models that mapping — re-read it')

function evalNormal({ W, H, span, h, exag = 1, at, on = 1 }) {
  // a W×H heightfield over [0, span]², sampled by three's LinearFilter at texel centres.
  const data = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data[j * W + i] = h(i * span / (W - 1), j * span / (H - 1))
  const texel = (i, j) => data[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))]
  const texture2D = (_m, uv) => {
    const x = uv.x * W - 0.5, y = uv.y * H - 0.5, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
    return { r: (texel(i, j) * (1 - fx) + texel(i + 1, j) * fx) * (1 - fy) + (texel(i, j + 1) * (1 - fx) + texel(i + 1, j + 1) * fx) * fy }
  }
  const clamp01 = v => Math.min(1, Math.max(0, v))
  const U = { uSpanX: span, uSpanZ: span, uTexW: W, uTexH: H, uBMinX: 0, uBMinZ: 0, uExag: exag, uTerrainMap: null, uTerrainNormals: on }
  const _terrainUV = (raw) => ({ x: (clamp01(raw.x) * (U.uTexW - 1) + 0.5) / U.uTexW, y: (clamp01(raw.y) * (U.uTexH - 1) + 0.5) / U.uTexH })
  const vec2 = (x, y) => ({ x, y }), vec3 = (x, y, z) => ({ x, y, z })
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
  const normalize = v => { const L = Math.hypot(v.x, v.y, v.z); return { x: v.x / L, y: v.y / L, z: v.z / L } }
  const _nw = { x: at[0], z: at[1] }
  let objectNormal = { x: 0, y: 1, z: 0 }   // the flat baked ground's geometry normal
  if (U.uExag > 0.01) {
    // eslint-disable-next-line no-new-func
    objectNormal = new Function('U', 'texture2D', '_terrainUV', 'vec2', 'vec3', 'normalize', 'mix', '_nw', 'objectNormal0',
      `const { uSpanX, uSpanZ, uTexW, uTexH, uBMinX, uBMinZ, uExag, uTerrainMap, uTerrainNormals } = U; let objectNormal = objectNormal0;\n${toJS(body[1])}\nreturn objectNormal`)(U, texture2D, _terrainUV, vec2, vec3, normalize, mix, _nw, objectNormal)
  }
  return objectNormal
}
const deg = n => Math.acos(Math.min(1, n.y)) * 180 / Math.PI
const near = (a, b, tol) => Math.abs(a - b) <= tol

console.log('① THE GLSL NORMAL, EVALUATED')
{
  const flat = evalNormal({ W: 65, H: 65, span: 640, h: () => 3, at: [320, 320] })
  near(flat.y, 1, 1e-9) ? console.log('   ✅ flat field → up') : bad(`flat field tilted: ${JSON.stringify(flat)}`)
  const g = 0.25   // rises 0.25 m per m eastward → 14.04°, normal leans WEST (−x)
  const ramp = evalNormal({ W: 65, H: 65, span: 640, h: (x) => g * x, at: [320, 320] })
  const want = Math.atan(g) * 180 / Math.PI
  near(deg(ramp), want, 0.01) && ramp.x < 0 && near(ramp.z, 0, 1e-9)
    ? console.log(`   ✅ 0.25 m/m ramp → ${deg(ramp).toFixed(2)}° from up, leaning downhill`)
    : bad(`ramp normal ${JSON.stringify(ramp)} — want ${want.toFixed(2)}° leaning −x`)
  const rampZ = evalNormal({ W: 65, H: 65, span: 640, h: (_x, z) => g * z, at: [320, 320] })
  near(deg(rampZ), want, 0.01) && rampZ.z < 0 ? console.log('   ✅ same ramp along z → leans −z') : bad(`z-ramp normal ${JSON.stringify(rampZ)}`)
  const x2 = evalNormal({ W: 65, H: 65, span: 640, h: (x) => g * x, at: [320, 320], exag: 2 })
  near(deg(x2), Math.atan(2 * g) * 180 / Math.PI, 0.01) ? console.log('   ✅ exag 2 doubles the slope the light sees') : bad(`exag 2 → ${deg(x2).toFixed(2)}°`)
  const browse = evalNormal({ W: 65, H: 65, span: 640, h: (x) => g * x, at: [320, 320], exag: 0 })
  near(browse.y, 1, 1e-9) ? console.log('   ✅ exag 0 (flat Browse map) → geometry normal kept') : bad('exag 0 tilted the normal')
  // The eye-gate A/B: at 0 the geometry normal, at 1 the terrain's — and it SHIPS at 1.
  const ab = evalNormal({ W: 65, H: 65, span: 640, h: (x) => g * x, at: [320, 320], on: 0 })
  near(ab.y, 1, 1e-9) ? console.log('   ✅ uTerrainNormals 0 → geometry normal (the A/B\'s "before")') : bad('uTerrainNormals 0 still tilts')
  ;/uTerrainNormals:\s*\{\s*value:\s*1\s*\}/.test(src) ? console.log('   ✅ uTerrainNormals ships at 1') : bad('uTerrainNormals does not ship at 1 — the ground would render lit as flat')
}

console.log('② THE STEP IS THE GRID\'S OWN')
for (const step of [1, 2, 10]) {
  // a ripple of wavelength 4 grid steps: a central difference at ±1 step reads it
  // exactly on the samples; at any other step it reads a different slope.
  const W = 129, span = step * (W - 1), lam = 4 * step, A = 0.3 * step
  const h = (x) => A * Math.sin(2 * Math.PI * x / lam)
  const i0 = 60, x = i0 * step + step * 0.5 * 0          // on a sample
  const expect = -(h(x + step) - h(x - step)) / (2 * step)  // −dh/dx at the grid step
  const n = evalNormal({ W, H: W, span, h, at: [x, span / 2] })
  const got = n.x / n.y
  near(got, expect, 1e-6) ? console.log(`   ✅ ${step} m grid: slope read at ±${step} m`) : bad(`${step} m grid: normal reads slope ${got.toFixed(4)}, the grid step gives ${expect.toFixed(4)} — the sample step is not this grid's`)
}
if (/\b\d+\.\d+\b/.test(NORMAL.replace(/\b(0\.01|0\.0|1\.0|2\.0)\b/g, ''))) bad('TERRAIN_NORMAL carries a numeric literal beyond 0.01/0.0/1.0/2.0 — a metre constant in the normal')

console.log('③ EVERY GROUND MATERIAL ASKS FOR IT')
for (const f of ['src/components/BakedGround.jsx', 'src/components/gravelPathMaterial.js']) {
  const code = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
  const calls = [...code.matchAll(/patchTerrain\(([^)]*)\)/g)].map(m => m[1])
  if (!calls.length) { bad(`${f}: no patchTerrain call at all`); continue }
  const missing = calls.filter(c => !/terrainNormals:\s*true/.test(c))
  missing.length ? bad(`${f}: ${missing.length}/${calls.length} patchTerrain call(s) without terrainNormals: true`) : console.log(`   ✅ ${f}: ${calls.length} call(s)`)
}

console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
