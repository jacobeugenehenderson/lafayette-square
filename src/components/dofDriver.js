/**
 * dofDriver — the ONE per-frame DoF driver.
 *
 * Resolves the operator's `dof` channel + the live camera into RomanceDoF's
 * `_dofRefs` (the shader's uniforms). Called from usePostFxDriver — the ONE
 * per-frame driver all three surfaces (production, Stage, Preview) run through —
 * so the focal distance and what is focused cannot drift between the shipping
 * render and the publish-confidence gate (Preview). (Preview's own forked
 * driver, frozen at mount, is retired: 2026-06-30.)
 *
 * NOT here, and ⛔ UNBUILT: a per-surface pyramid rung (ROADMAP.md H1;
 * renderTiers.js header). DownsamplePyramid takes no props and a phone runs no
 * pyramid, so there is no degree for this driver to know.
 */
import * as THREE from 'three'
import { _dofRefs } from './RomanceDoF.jsx'
import { isMarked, isRevealed } from '../lib/startupMarks.js'
import { getSceneStencil } from './sceneStencilState.js'
import { resolveGroupAtMinute } from '../cartograph/animatedParam.js'
import { DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'

const _heroVec = new THREE.Vector3()  // reused for a point's ground distance (distOf)
let _warnedNoFocus = false, _warnedNoDisc = false
let _framesSeen = 0
// Read-only inspection (as terrainShader's window.__terrainExag): this frame's focus — what probes and Preview read.
const _inspect = { focus: null, dA: null, dB: null, dist: null }
if (typeof window !== 'undefined') window.__dof = _inspect

/**
 * Populate RomanceDoF's `_dofRefs` from the resolved `dof` channel + live
 * camera. Call once per frame from the consumer's useFrame, only when DoF is
 * mounted (cheap, but pointless otherwise).
 *
 * @param camera      the live THREE camera (state.camera / useThree)
 * @param dofChannel  the resolved `dof` channel (override ?? scene.dof ?? default)
 * @param minute      current TOD minute-of-day
 * @param slotMins    TOD slot minutes for the resolver
 * @param focusPoint  where the camera is looking — the controls' target: the focus in the views that take the aim (Street).
 * @param choice      what is focused (src/lib/focusObject.js#focusChoice, the one decision, by the view): { off } (Browse,
 *                    or the town not loaded) · { aim } · { a, b, lam, weight, heroMeshes } — `a` and `b` the two focus
 *                    objects' world boxes [x0,y0,z0,x1,y1,z1] (null where an end names nothing), `lam` how far the
 *                    segment has come, `weight` how much of a focus plane there is (0: the town's law). The focal
 *                    distance RACKS from a's to b's on the camera's own timing; the hero ladder's box is the nearer end's.
 */
const _aim = new THREE.Vector3()
const _boxC = new THREE.Vector3()
const _corner = new THREE.Vector3()
/** The hero's box on screen, uv (x0, y0, x1, y1), or null when there is no box or it is behind the camera. Sets
 *  `_heroNear`, the view depth of the box's nearest corner (what is nearer than it, at a pixel, stands in front). */
let _heroNear = 0
function heroRectOnScreen(box, camera) {
  if (!Array.isArray(box) || box.length !== 6) return null
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  _heroNear = Infinity
  for (let i = 0; i < 8; i++) {
    _corner.set(box[i & 1 ? 3 : 0], box[i & 2 ? 4 : 1], box[i & 4 ? 5 : 2]).applyMatrix4(camera.matrixWorldInverse)
    _heroNear = Math.min(_heroNear, -_corner.z)
    if (_corner.z > -camera.near) return [0, 0, 1, 1]                       // straddles the camera: take the screen
    _corner.applyMatrix4(camera.projectionMatrix)
    const u = _corner.x * 0.5 + 0.5, v = _corner.y * 0.5 + 0.5
    x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v)
  }
  if (x1 < 0 || y1 < 0 || x0 > 1 || y0 > 1) return null                     // off screen
  return [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)]
}
const centreOf = (box, out) => out.set((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2)
export function applyDofFrame({ camera, dofChannel, minute, slotMins, focusPoint, choice }) {
  _dofRefs.near.current = camera.near; _dofRefs.far.current = camera.far
  // CoC paint: window.__dofDebug = 1 (green = sharp, red = full blur). (Preview sets this from ?dofDebug=1.)
  _dofRefs.debug.current = (typeof window !== 'undefined' && window.__dofDebug) ? 1 : 0
  _dofRefs.heroRect.current = null; _dofRefs.heroMeshes.current = null; _dofRefs.focusOn.current = 1
  const off = () => { _dofRefs.maxBlur.current = 0; _dofRefs.heroBlur.current = 0 }
  // ⛔ BROWSE HAS NO DEPTH OF FIELD — a fact of the VIEW (Jacob), decided in focusChoice. It replaced a camera-pose test
  // (looking down) that stood in for the view.
  if (!choice || choice.off) { off(); return }
  const d = resolveGroupAtMinute(dofChannel, minute, slotMins, DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS)
  _dofRefs.maxBlur.current  = d.blur
  _dofRefs.heroBlur.current = d.heroBlur ?? DOF_FLAT_DEFAULTS.heroBlur
  _dofRefs.zone.current     = 0.03 + d.softness * 0.4                                  // Clear window: the sharp zone's depth
  _dofRefs.ramp.current     = 0.05 + (d.melt ?? DOF_FLAT_DEFAULTS.melt) * 0.9           // Window softness: how gently it melts
  // The tilted plane: distances along the ground (the shader measures every pixel the same way).
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 45) / 2)
  _dofRefs.tanHalf.current.set(tanY * (camera.aspect ?? 1), tanY)
  _dofRefs.upView.current.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
  const up = _dofRefs.upView.current
  // A point's focal distance: along the ground, in view space (the shader measures every pixel the same way).
  const distOf = (p) => { _heroVec.copy(p).applyMatrix4(camera.matrixWorldInverse); return _heroVec.addScaledVector(up, -_heroVec.dot(up)).length() }

  if (choice.aim) {
    // The views that take the aim (Street): the focal plane at the controls' target. ⛔ No target ⇒ no depth of field,
    // said once — never a guessed distance. Said on the EVENT that a town is shown — the reveal (startupMarks.js) —
    // never on the frames before it, while the app's controls are still mounting.
    if (!focusPoint) {
      const shown = isMarked('gate') ? isRevealed() : _framesSeen++ > 0
      if (shown && !_warnedNoFocus) { _warnedNoFocus = true; console.error('[dof] no focus point (no controls target) — depth of field is off') }
      off(); return
    }
    _dofRefs.focusDist.current = Math.max(1, distOf(_aim.copy(focusPoint)))
    _inspect.focus = null; _inspect.dA = _inspect.dB = _inspect.dist = _dofRefs.focusDist.current; _inspect.heroRect = null
    return
  }

  // ⭐ THE HERO VIEW: the focus objects. ⛔ Never the aim: an end that names nothing has no plane (weight), and where there
  // is less than a whole plane the TOWN's law takes the rest — anchored to the disc, not the camera (Jacob, 2026-10-28).
  const lam = choice.lam, near = lam < 0.5 ? choice.a : choice.b
  _dofRefs.focusOn.current = choice.weight
  _dofRefs.camWorld.current.copy(camera.matrixWorld)
  if (choice.weight < 1) {
    // ⛔ The town's disc is the scene's stencil (sceneStencilState: ground.json#stencil), never a guessed one: with none,
    // the town law has no centre, so there is no depth of field this frame, said once.
    const s = getSceneStencil()
    if (!s) { if (!_warnedNoDisc) { _warnedNoDisc = true; console.error('[dof] ⛔ no focus object and no scene stencil (ground.json#stencil) — the town\'s blur has no disc; depth of field is off') } off(); return }
    _dofRefs.discC.current.set(s.center[0], s.center[1]); _dofRefs.discR.current = s.radius
  }
  _dofRefs.heroRect.current = heroRectOnScreen(near, camera)
  _dofRefs.heroNear.current = _dofRefs.heroRect.current ? _heroNear : 0
  _dofRefs.heroMeshes.current = _dofRefs.heroRect.current ? (choice.heroMeshes ?? null) : null
  const dA = choice.a ? distOf(centreOf(choice.a, _boxC)) : null, dB = choice.b ? distOf(centreOf(choice.b, _boxC)) : null
  _inspect.focus = choice; _inspect.dA = dA; _inspect.dB = dB; _inspect.heroRect = _dofRefs.heroRect.current
  if (dA == null && dB == null) { _inspect.dist = null; return }   // no plane: focusOn 0, the town's law
  const a = dA ?? dB, b = dB ?? dA   // a broken end has no plane of its own: its weight takes the plane out, not its distance
  _dofRefs.focusDist.current = Math.max(1, a + (b - a) * lam)
  _dofRefs.heroGround.current = lam < 0.5 ? a : b
  _inspect.dist = _dofRefs.focusDist.current
}
