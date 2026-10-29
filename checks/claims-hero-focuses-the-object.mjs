#!/usr/bin/env node
// CLAIM — IN THE HERO VIEW, DEPTH OF FIELD FOCUSES AN OBJECT, NEVER THE AIM (Jacob, 2026-10-28; registry
// r-stage-focuses-the-object-and-captures-the-screen; Zob's plan PASS with two edits). The hero view leaked the camera's
// aim (the orbit pivot) whenever the movie published no focus (paused off the playhead, no keys) or the hero resolved to
// nothing. Now src/lib/focusObject.js#focusChoice decides, by the VIEW, and src/components/dofDriver.js#applyDofFrame
// applies it. ⭐ Focus lives only on the keyframes (2026-10-28: the Survey hero retired). PLANTED (a scene with a
// `focus:arch` mesh 1000 m ahead, the camera's aim 10 km away, Amount 0.3):
//   (1) Hero, the movie publishing the key's 'arch' → the focal distance is the Arch's, not the aim's; weight 1.
//   (2) Hero, the movie publishing nothing (no key names an object) → no focus plane (focusOn 0), maxBlur = the Amount;
//       and the law (DOF_BLUR_GLSL)
//       takes the TOWN's law at focusOn 0 (claims-the-no-focus-blur-is-the-towns.mjs holds what that law is).
//   (3) the same at Amount 0 → maxBlur 0, every pixel sharp, and the DoF pass is switched off (RomanceDoF's enable).
//   (4) Street → the aim.  (5) Browse → off (maxBlur 0), by the view.  (7) the town's design not yet in hand → off.
//   (6) a rack from the drawable Arch to an id that names nothing → weight 1 → 0.5 → 0 across lam (Zob's ruling: a
//       broken end has no plane; never the other end's distance held).
//   MUTANT (always run): the aim fallback restored in Hero (focusChoice answering { aim } when nothing resolves) → (2) RED.
//   node checks/claims-hero-focuses-the-object.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const THREE = await vite.ssrLoadModule('three'), FO = await vite.ssrLoadModule('/src/lib/focusObject.js')
  ;(await vite.ssrLoadModule('/src/components/sceneStencilState.js')).setSceneStencil({ center: [0, -1000], radius: 900 })   // the town's disc: the no-focus law needs it
  const { applyDofFrame } = await vite.ssrLoadModule('/src/components/dofDriver.js'), { _dofRefs, DOF_BLUR_GLSL } = await vite.ssrLoadModule('/src/components/RomanceDoF.jsx')
  const quiet = (f) => { const e = console.error, i = console.info; console.error = () => {}; console.info = () => {}; try { return f() } finally { console.error = e; console.info = i } }
  const scene = new THREE.Scene(), arch = new THREE.Mesh(new THREE.BoxGeometry(20, 190, 20)); arch.name = 'focus:arch'; arch.position.set(0, 95, -1000); scene.add(arch); scene.updateMatrixWorld(true)
  const camera = new THREE.PerspectiveCamera(22, 1.5, 1, 60000); camera.position.set(0, 50, 0); camera.lookAt(0, 50, -1); camera.updateMatrixWorld(true)
  const aim = new THREE.Vector3(0, 0, -10000), ctx = { scene, index: null, exag: 1 }
  const ARCH = { on: true, from: 'arch', to: 'arch', lam: 0 }, chan = (blur) => ({ values: { blur, heroBlur: 0, softness: 0.5, melt: 0.5 } })   // a flat channel
  const frame = (focusChoice, { viewMode, mf = { on: false }, blur = 0.3, designLoaded = true }) => quiet(() => {
    const choice = focusChoice({ viewMode, movieFocus: mf, designLoaded, ctx })
    applyDofFrame({ camera, dofChannel: chan(blur), minute: 720, slotMins: {}, focusPoint: aim, choice })
    return { choice, dist: _dofRefs.focusDist.current, on: _dofRefs.focusOn.current, max: _dofRefs.maxBlur.current } })
  const judgeNoFocus = (fc) => { const f = frame(fc, { viewMode: 'hero' }); return { f, ok: f.on === 0 && Math.abs(f.max - 0.3) < 1e-9 } }

  { const f = frame(FO.focusChoice, { viewMode: 'hero', mf: ARCH }); row(Math.abs(f.dist - 1000) < 15 && f.on === 1 && Math.abs(f.max - 0.3) < 1e-9, `(1) Hero, the key focusing the Arch: focal distance ${f.dist.toFixed(1)} m (the Arch ~1000 m, the aim 10 km), weight ${f.on}`) }
  { const J = judgeNoFocus(FO.focusChoice), law = /return mix\(townLaw\(p\), objectLaw\([^\n]*\), uFocusOn\);/.test(DOF_BLUR_GLSL)
    row(J.ok && law, `(2) Hero, no key names an object: focusOn ${J.f.on}, maxBlur ${J.f.max} (the Amount 0.3) · the law takes the town's at focusOn 0: ${law}`) }
  { const f = frame(FO.focusChoice, { viewMode: 'hero', blur: 0 }), src = readFileSync(join(ROOT, 'src/components/RomanceDoF.jsx'), 'utf8'), offAt0 = /pass\.enabled = _dofRefs\.maxBlur\.current > 0\n/.test(src)
    row(f.max === 0 && offAt0, `(3) the same at Amount 0: maxBlur ${f.max} (every pixel sharp) · the pass switches off at maxBlur 0: ${offAt0}`) }
  { const f = frame(FO.focusChoice, { viewMode: 'planetarium', mf: ARCH }); row(Math.abs(f.dist - 10000) < 60 && !f.choice.a, `(4) Street: the aim — focal distance ${f.dist.toFixed(1)} m`) }
  { const f = frame(FO.focusChoice, { viewMode: 'browse', mf: ARCH }); row(f.max === 0 && f.choice.off === true, `(5) Browse: off by the view — maxBlur ${f.max}`) }
  { const w = [0, 0.5, 1].map(lam => frame(FO.focusChoice, { viewMode: 'hero', mf: { on: true, from: 'arch', to: 'nothing-draws-this', lam } }).on)
    row(w[0] === 1 && w[1] === 0.5 && w[2] === 0, `(6) a rack from the Arch to an id that names nothing: weight ${w.join(' → ')} across lam 0, 0.5, 1`) }

  { const f = frame(FO.focusChoice, { viewMode: 'hero', mf: ARCH, designLoaded: false }); row(f.choice.off === true && f.max === 0, `(7) the town's design not yet in hand: off — maxBlur ${f.max}`) }

  // MUTANT: the aim fallback restored in Hero
  const mutant = (args) => { const c = FO.focusChoice(args); return c.weight === 0 ? { aim: true } : c }
  { const J = judgeNoFocus(mutant); row(!J.ok, `mutant: the aim fallback restored in Hero → ${J.ok ? 'still GREEN — the row proves nothing' : `RED as it must be (focusOn ${J.f.on}, focal distance ${J.f.dist.toFixed(0)} m)`}`) }
} finally { await vite.close() }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ in the hero view, depth of field focuses an object, never the aim')
process.exit(red ? 1 : 0)
