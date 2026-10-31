#!/usr/bin/env node
/**
 * "IS THE FOCUS OBJECT EVERYTHING HUNG ON IT, AT ITS OWN DISTANCE?" (r-the-focus-object-is-everything-hung-on-it; Jacob,
 * 2026-10-31: "the bulbs and strands don't have depth AND they're not attached to the hero object for sharpness"; plan
 * by Tinsel, co-signed by Zob with two holds and a condition, released by Boz.)
 *
 * PLANTED (a set-piece root `focus:sp`, extent 4 m × 70 m, with a child declaring a 31 m reach, OFF-centre (20 m across, 60 m toward the camera) so a
 * reach read where the extent belongs moves the numbers):
 *   1. focusObject.js#focusBox returns { extent, reach }: the extent the set-piece's own; the reach covers the child's
 *      declared cylinder; collected on every call (a child added after a first call is seen on the next: no cache);
 *   2. dofDriver.js#applyDofFrame: the hero's rect on screen (the mask's scissor) is the REACH's; the focal distance,
 *      heroGround and heroNear are the EXTENT's (Zob's HOLD 2 and condition);
 *   3. RomanceDoF.jsx#mainImage: where the mask covers (inside the rect, nothing nearer than heroNear), the blur is the
 *      object's own law at its distance, whatever the depth buffer holds (a source match bound to the expression: there
 *      is no render instrument, brief §2a);
 *   4. the source rule (Boz's condition 2): every child SetPiece.jsx mounts under the set-piece's root, and every plugin
 *      in Displays.jsx's PLUGINS, read from source, never listed here, either declares `focusReach` or draws no mesh.
 *
 * Usage: node checks/claims-the-focus-object-is-everything-hung-on-it.mjs [--mutants]
 *   --mutants: the reach ignored · the rect from the extent · heroNear from the reach · the focal distance from the reach ·
 *   the shader's binding dropped · the Light Show declaring no reach, each red.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createServer } from 'vite'
import { ROOT } from './_scenes.mjs'

const src = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
// A mutant is a module's source transformed IN MEMORY by this server (nothing written to disk), then every module invalidated.
const MUT = {}
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{ name: 'check-mutant', enforce: 'pre', transform(text, id) { const f = MUT[id.split('?')[0]]; return f ? f(text) : null } }] })

async function verdict({ focus, driver, shader, lightShow } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const run = async () => {
    const THREE = await vite.ssrLoadModule('three'), FO = await vite.ssrLoadModule('/src/lib/focusObject.js')
    const { applyDofFrame } = await vite.ssrLoadModule('/src/components/dofDriver.js'), { _dofRefs } = await vite.ssrLoadModule('/src/components/RomanceDoF.jsx')
    const scene = new THREE.Scene(), root = new THREE.Group()
    root.name = 'focus:sp'; root.userData.extent = { halfWidthM: 4, topM: 70 }; root.position.set(0, 0, -500); scene.add(root)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 70, 8)); mesh.position.y = 35; root.add(mesh)
    scene.updateMatrixWorld(true)
    const ctx = { scene, index: null, exag: 1 }
    const before = FO.focusBox('sp', ctx)
    const hung = new THREE.Group(); hung.position.set(20, 0, 60); hung.userData.focusReach = { radiusM: 31, fromM: 6, toM: 70 }; root.add(hung); scene.updateMatrixWorld(true)
    const b = FO.focusBox('sp', ctx)
    F(b && Array.isArray(b.extent) && Array.isArray(b.reach), 'focusBox does not return { extent, reach }')
    if (!b?.extent || !b?.reach) return
    F(Math.abs(b.extent[0] + 4) < 1e-6 && Math.abs(b.extent[3] - 4) < 1e-6 && Math.abs(b.extent[4] - 70) < 1e-6, `the extent is not the set-piece's own (${b.extent})`)
    F(b.reach[0] <= 20 - 31 + 1e-6 && b.reach[3] >= 20 + 31 - 1e-6 && b.reach[2] <= -440 - 31 + 1e-6 && b.reach[5] >= -440 + 31 - 1e-6, `the reach does not cover the hung child's 31 m (${b.reach.map(v => v.toFixed(1))})`)
    F(before && before.reach[3] - before.reach[0] < 9, 'before the child was hung the reach was already grown (planted wrong)')
    // 2. the driver: rect from the reach; distance, heroGround, heroNear from the extent.
    const camera = new THREE.PerspectiveCamera(30, 1.5, 1, 60000); camera.position.set(0, 40, 0); camera.lookAt(0, 40, -500); camera.updateMatrixWorld(true)
    const quiet = (f) => { const e = console.error; console.error = () => {}; try { return f() } finally { console.error = e } }
    const choice = FO.focusChoice({ viewMode: 'hero', movieFocus: { on: true, from: 'sp', to: 'sp', lam: 0 }, designLoaded: true, ctx })
    quiet(() => applyDofFrame({ camera, dofChannel: { values: { blur: 0.3, heroBlur: 0, softness: 0.5, melt: 0.5 } }, minute: 720, slotMins: {}, focusPoint: null, choice }))
    const r = _dofRefs.heroRect.current
    F(r && r[2] - r[0] > 0.1, `the hero's rect on screen is not the reach's (width ${r ? (r[2] - r[0]).toFixed(3) : 'none'}; the extent alone is ~0.03; the reach ~0.15)`)
    const V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorldInverse)
    const ground = (x, y, z) => { V.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); return V.addScaledVector(up, -V.dot(up)).length() }
    const dExt = ground(0, 35, -500)
    F(Math.abs(_dofRefs.focusDist.current - dExt) < 0.5, `the focal distance (${_dofRefs.focusDist.current.toFixed(2)}) is not the extent's (${dExt.toFixed(2)})`)
    F(Math.abs(_dofRefs.heroGround.current - dExt) < 0.5, `heroGround (${_dofRefs.heroGround.current.toFixed(2)}) is not the extent's (${dExt.toFixed(2)})`)
    F(Math.abs(_dofRefs.heroNear.current - 496) < 0.5, `heroNear (${_dofRefs.heroNear.current.toFixed(2)}) is not the extent's nearest corner (496)`)
  }
  for (const k of Object.keys(MUT)) delete MUT[k]
  if (focus) MUT[join(ROOT, 'src/lib/focusObject.js')] = focus
  if (driver) MUT[join(ROOT, 'src/components/dofDriver.js')] = driver
  vite.moduleGraph.invalidateAll()
  try { await run() } finally { for (const k of Object.keys(MUT)) delete MUT[k]; vite.moduleGraph.invalidateAll() }
  // 3. the shader's binding.
  const rd = code(shader ? shader(src('src/components/RomanceDoF.jsx')) : src('src/components/RomanceDoF.jsx'))
  F(/float m = texture2D\(uMask, uv\)\.a \* step\(uHeroNear, dist\) \* uFocusOn;\s*amt = mix\(amt, clamp\(objectLaw\(uHeroGround\), 0\.0, 1\.0\), m\);/.test(rd), 'DOF_FOCUS_OBJECT_GLSL does not take the focus object\'s blur where its mask covers')
  F(/float amt  = focusObjectAmount\(clamp\(blurAmount\(dist, uv\), 0\.0, 1\.0\), dist, uv\);/.test(rd), 'RomanceDoF#mainImage does not apply focusObjectAmount')
  const dbg = code(src('src/components/DofDebug.jsx'))
  F(/\$\{DOF_FOCUS_OBJECT_GLSL\}/.test(dbg) && /focusObjectAmount\(/.test(dbg) && /_heroLadderRefs\.mask\.current/.test(dbg), 'the debug paint (DofDebug.jsx) does not paint the focus object\'s blur as the pass takes it')
  // 4. the source rule: every child under the set-piece root declares its reach or draws no mesh.
  const sp = code(src('src/components/SetPiece.jsx')), inner = sp.match(/<R [^>]*>([\s\S]*?)<\/R>/)?.[1]
  F(!!inner, 'SetPiece.jsx: no <R …>…</R> to read the children of')
  const imports = Object.fromEntries([...sp.matchAll(/import\s+(\w+)[^'"]*from\s+['"]([^'"]+)['"]/g)].map(m => [m[1], m[2]]))
  const files = []
  for (const tag of new Set([...(inner || '').matchAll(/<([A-Z]\w*)/g)].map(m => m[1]))) {
    const p = imports[tag]; if (!p) { fails.push(`SetPiece.jsx mounts <${tag}> under the set-piece, and its import is not found`); continue }
    files.push(join('src/components', p).replace(/\\/g, '/') + (p.match(/\.\w+$/) ? '' : '.jsx'))
  }
  const seen = []
  for (const f of files) {
    const rel = existsSync(join(ROOT, f)) ? f : f.replace(/\.jsx$/, '.js')
    let s = src(rel)
    const plugins = [...s.matchAll(/lazy\(\(\) => import\(['"]([^'"]+)['"]\)\)/g)].map(m => join(dirname(rel), m[1]))
    if (plugins.length) { for (const p of plugins) seen.push(p); continue }   // a mount: its plugins are the children
    seen.push(rel)
  }
  for (const rel of seen) {
    let s = code(src(rel)); if (lightShow && rel.endsWith('LightShow.jsx')) s = code(lightShow(src(rel)))
    const draws = /<(mesh|instancedMesh|points|lineSegments)\b|new THREE\.(Mesh|InstancedMesh|Points)\b/.test(s)
    if (draws && !/focusReach:/.test(s)) fails.push(`${rel} draws under the set-piece's root and declares no focusReach: its pixels would be scissored out of the focus object`)
  }
  F(seen.length >= 2, `the source rule read only ${seen.length} child(ren): it would pass on nothing`)
  return fails
}

try {
  const fails = await verdict()
  if (fails.length) { console.log('⛔ the focus object is not everything hung on it:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
  else console.log('✅ the focus object is everything hung on it: the reach grows the mask\'s rect, the extent keeps its distance and what stands in front; the shader blurs its covered pixels at its distance; every child under a set-piece declares its reach or draws nothing')
  if (process.argv.includes('--mutants')) {
    const mutants = [
      ['the reach ignored', { focus: (s) => s.replace('const r = o.userData?.focusReach; if (!r) return', 'return') }],
      ['the rect from the extent', { driver: (s) => s.replace('heroRectOnScreen(near.reach, camera)', 'heroRectOnScreen(near.extent, camera)') }],
      ['heroNear from the reach', { driver: (s) => s.replace('nearestDepth(near.extent, camera)', 'nearestDepth(near.reach, camera)') }],
      ['the focal distance from the reach', { driver: (s) => s.replace('distOf(centreOf(choice.a.extent, _boxC))', 'distOf(centreOf(choice.a.reach, _boxC))') }],
      ['the shader\'s binding dropped', { shader: (s) => s.replace('amt = mix(amt, clamp(objectLaw(uHeroGround), 0.0, 1.0), m);', '') }],
    ['the pass not applying it', { shader: (s) => s.replace('float amt  = focusObjectAmount(clamp(blurAmount(dist, uv), 0.0, 1.0), dist, uv);', 'float amt  = clamp(blurAmount(dist, uv), 0.0, 1.0);') }],
      ['the Light Show declaring no reach', { lightShow: (s) => s.replace('userData={{ focusReach:', 'userData={{ noReach:') }],
    ]
    let bad = 0
    for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
    if (bad) process.exitCode = 1
  }
} finally { await vite.close() }
process.exit(process.exitCode ?? 0)   // the server leaves handles open (as claims-hero-focuses-the-object)
