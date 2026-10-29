#!/usr/bin/env node
// CLAIM — WITH NO FOCUS OBJECT, THE BLUR IS THE TOWN'S (Jacob, 2026-10-28, registry r-stage-focuses-the-object-and-
// captures-the-screen · noFocusObject; Zob's plan PASS; Boz's ruling (a) on Window softness). A pixel's WORLD ground
// distance from the town's disc centre over its radius drives the blur: sharp at the centre, the Amount at the rim and
// beyond, held still as the camera moves. It replaced "the Amount everywhere" (same day).
//   (1) SOURCE, RomanceDoF.jsx#DOF_BLUR_GLSL: townLaw takes the pixel to WORLD through uCamWorld and measures from
//       uDiscC over uDiscR, ramping by uRamp (Window softness, the share of the radius); no number of its own but 1;
//       blurAmount mixes townLaw and objectLaw by uFocusOn; all three passes declare the town's uniforms.
//   (2) SOURCE, dofDriver.js: camWorld from camera.matrixWorld; the disc from the scene's stencil (sceneStencilState),
//       and with none, no depth of field, said — never a guessed disc.
//   (3) PLANTED (node): no focus object, a stencil at (100, −50) r 700 → the refs carry exactly that disc and the camera's
//       matrix; no stencil → maxBlur 0 and the refusal said; Amount 0 with Softness at focus 0.4 → maxBlur 0, so the
//       centre's floor min(heroBlur, maxBlur) is 0 too and the pass is off (Zob's row).
// THE BROWSER RECEIPT (Huron, no hero; in the commit): world points at the centre, 0.5R, R, 1.3R projected and read off
// the debug paint (the law, drawn last): 0 · by the ramp · the Amount · the Amount; the same points from a second camera
// pose within 1/255; with the law put on VIEW space (camera-anchored) the second pose moves them.
//   MUTANT (always run): townLaw on view-space xz (camera-anchored) → (1) RED.
//   node checks/claims-the-no-focus-blur-is-the-towns.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const rd = (f) => readFileSync(join(ROOT, f), 'utf8')
const DOF = rd('src/components/RomanceDoF.jsx'), DRV = rd('src/components/dofDriver.js')
const judgeLaw = (s) => { const a = s.indexOf('float townLaw(vec3 pView) {'), body = a < 0 ? '' : s.slice(a, s.indexOf('\n  }\n', a))
  const nums = (body.match(/\b\d+(\.\d+)?(e-?\d+)?\b/g) || []).filter(n => !['1.0', '1', '1e-3', '3'].includes(n))
  return { nums, ok: /length\(\(uCamWorld \* vec4\(pView, 1\.0\)\)\.xz - uDiscC\) \/ max\(uDiscR, 1e-3\)/.test(body) && /smoothstep\(1\.0 - uRamp, 1\.0, r\)/.test(body) && !nums.length
    && /return mix\(townLaw\(p\), objectLaw\([^\n]*\), uFocusOn\);/.test(s) } }
{ const J = judgeLaw(DOF), passes = ['src/components/RomanceDoF.jsx', 'src/components/HeroLadder.jsx', 'src/components/DofDebug.jsx'].filter(f => !/uDiscC/.test(rd(f)) || !/uCamWorld/.test(rd(f)))
  row(J.ok && !passes.length, `(1) the town law: world xz through uCamWorld, from uDiscC over uDiscR, ramped by uRamp, no number of its own (${J.nums.join(', ') || 'none'}); mixed with the object law by uFocusOn; every pass declares it${passes.length ? ` — missing in ${passes.join(', ')}` : ''}: ${J.ok && !passes.length}`) }
{ const ok = /_dofRefs\.camWorld\.current\.copy\(camera\.matrixWorld\)/.test(DRV) && /const s = getSceneStencil\(\)/.test(DRV) && /if \(!s\) \{[^\n]*console\.error\([^\n]*off\(\); return \}/.test(DRV) && /_dofRefs\.discC\.current\.set\(s\.center\[0\], s\.center\[1\]\); _dofRefs\.discR\.current = s\.radius/.test(DRV)
  row(ok, `(2) dofDriver: the camera's matrix, the disc from the scene stencil, and with none no depth of field, said: ${ok}`) }

const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const THREE = await vite.ssrLoadModule('three'), FO = await vite.ssrLoadModule('/src/lib/focusObject.js'), ST = await vite.ssrLoadModule('/src/components/sceneStencilState.js')
  const { applyDofFrame } = await vite.ssrLoadModule('/src/components/dofDriver.js'), { _dofRefs } = await vite.ssrLoadModule('/src/components/RomanceDoF.jsx')
  const camera = new THREE.PerspectiveCamera(22, 1.5, 1, 60000); camera.position.set(300, 120, 400); camera.lookAt(100, 0, -50); camera.updateMatrixWorld(true)
  const said = []; const run = (blur, heroBlur = 0) => { const e = console.error, i = console.info; console.error = (m) => said.push(String(m)); console.info = () => {}
    try { applyDofFrame({ camera, dofChannel: { values: { blur, heroBlur, softness: 0.5, melt: 0.5 } }, minute: 720, slotMins: {}, focusPoint: null, choice: FO.focusChoice({ viewMode: 'hero', movieFocus: { on: false }, designLoaded: true, ctx: { scene: new THREE.Scene() } }) }) } finally { console.error = e; console.info = i } }
  ST.setSceneStencil({ center: [100, -50], radius: 700 }); run(0.3)
  const c = _dofRefs.discC.current, sameCam = _dofRefs.camWorld.current.equals(camera.matrixWorld)
  row(_dofRefs.focusOn.current === 0 && c.x === 100 && c.y === -50 && _dofRefs.discR.current === 700 && sameCam && _dofRefs.maxBlur.current === 0.3, `(3a) no focus object, stencil (100, −50) r 700: disc (${c.x}, ${c.y}) r ${_dofRefs.discR.current} · camera matrix ${sameCam} · focusOn ${_dofRefs.focusOn.current} · maxBlur ${_dofRefs.maxBlur.current}`)
  ST.setSceneStencil(null, 'planted: no ground'); said.length = 0; run(0.3)
  row(_dofRefs.maxBlur.current === 0 && said.some(m => /no scene stencil/.test(m)), `(3b) no stencil: maxBlur ${_dofRefs.maxBlur.current}, said: ${said.find(m => /stencil/.test(m))?.slice(0, 90) ?? 'nothing'}`)
  ST.setSceneStencil({ center: [100, -50], radius: 700 }); run(0, 0.4)
  row(_dofRefs.maxBlur.current === 0 && Math.min(_dofRefs.heroBlur.current, _dofRefs.maxBlur.current) === 0, `(3c) Amount 0 with Softness at focus 0.4: maxBlur ${_dofRefs.maxBlur.current}, the centre's floor ${Math.min(_dofRefs.heroBlur.current, _dofRefs.maxBlur.current)} — sharp everywhere, the pass off`)
} finally { await vite.close() }

// MUTANT: the town law on view space (camera-anchored)
{ const m = DOF.replace('length((uCamWorld * vec4(pView, 1.0)).xz - uDiscC)', 'length(pView.xz - uDiscC)')
  if (m === DOF) row(false, 'mutant (camera-anchored): its anchor is not in RomanceDoF.jsx — re-aim it')
  else row(!judgeLaw(m).ok, `mutant: the town law on view-space xz (camera-anchored) → ${judgeLaw(m).ok ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : "\n✅ with no focus object, the blur is the town's")
process.exit(red ? 1 : 0)
