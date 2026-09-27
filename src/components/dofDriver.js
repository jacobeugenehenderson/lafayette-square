/**
 * dofDriver — the ONE per-frame DoF driver.
 *
 * Resolves the operator's `dof` channel + the live camera into RomanceDoF's
 * `_dofRefs` (the shader's uniforms). Called from usePostFxDriver — the ONE
 * per-frame driver all three surfaces (production, Stage, Preview) run through —
 * so the hero-pocket VIEW-Z anchor and the browse (look-down) gate cannot drift
 * between the shipping render and the publish-confidence gate.
 *
 * Why this exists (2026-06-27): Preview previously forked its own URL-param
 * driver that read heroDist ONCE on mount with no per-frame VIEW-Z transform
 * and no look-down gate — so Preview's DoF was frozen and unfaithful, exactly
 * where Preview's whole job is parity (PREVIEW.md §0/§7). One driver, one place,
 * no second copy to hand-sync (the "one knob, never two copies" doctrine the
 * project applies to STREET_SMOOTH). The Preview fork is retired (2026-06-30).
 *
 * NOT here: the pyramid DEGREE (the resolution bracket per device-surface).
 * Everything ships to every surface; only the mip-rung resolution differs,
 * dialed on the DownsamplePyramid pass per tier (preview-equals-pyramid-tier-
 * ladder). This driver computes the same focus math regardless of bracket.
 */
import * as THREE from 'three'
import { _dofRefs } from './RomanceDoF.jsx'
import { resolveGroupAtMinute } from '../cartograph/animatedParam.js'
import { DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS } from '../cartograph/skyLightChannels.js'

const _camDir  = new THREE.Vector3()  // reused for the browse (look-down) gate
const _heroVec = new THREE.Vector3()  // reused for the focus-pocket view-Z depth
let _warnedNoFocus = false

/**
 * Populate RomanceDoF's `_dofRefs` from the resolved `dof` channel + live
 * camera. Call once per frame from the consumer's useFrame, only when DoF is
 * mounted (cheap, but pointless otherwise).
 *
 * @param camera      the live THREE camera (state.camera / useThree)
 * @param dofChannel  the resolved `dof` channel (override ?? scene.dof ?? default)
 * @param minute      current TOD minute-of-day
 * @param slotMins    TOD slot minutes for the resolver
 * @param focusPoint  where the camera is looking — the controls' target, which in
 *                    playback IS the interpolated keyframe target (Jacob,
 *                    2026-09-26: DoF focuses on the keyframe's authored target).
 *                    ⛔ Never a hero subject (BRIEF-camera-regimes).
 */
const _picked = new THREE.Vector3()
export function applyDofFrame({ camera, dofChannel, minute, slotMins, focusPoint, pickedFocus }) {
  // A picked focus (the Focus card's Pick) holds through the whole move; else the camera's aim.
  if (pickedFocus) focusPoint = _picked.fromArray(pickedFocus)
  const d = resolveGroupAtMinute(dofChannel, minute, slotMins, DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS)

  // Browse (overhead) camera: kill DoF — from above, the scene sits at ~one
  // depth, so DoF only smears the map. Gate on look-DOWN (not raw height, which
  // also caught the elevated Hero camera and killed DoF in the Hero shot) — it
  // separates Browse (vertical) from Hero/Street (horizontal).
  camera.getWorldDirection(_camDir)
  const browse = _camDir.y < -0.6

  // CoC paint: window.__dofDebug = 1 (green = sharp, red = full blur). (Preview sets this from ?dofDebug=1.)
  _dofRefs.debug.current    = (typeof window !== 'undefined' && window.__dofDebug) ? 1 : 0
  _dofRefs.maxBlur.current  = browse ? 0 : d.blur
  _dofRefs.heroBlur.current = browse ? 0 : (d.heroBlur ?? DOF_FLAT_DEFAULTS.heroBlur)
  _dofRefs.zone.current     = 0.03 + d.softness * 0.4                // deeper sharp zone as it softens
  _dofRefs.ramp.current     = 0.15 + d.softness * 0.8                // and a gentler melt
  // ⭐ THE FOCAL PLANE IS RELATIVE: `focus` × the view depth of what the camera looks at (the controls' target —
  // in playback, the interpolated keyframe target). The shader decodes `dist` as VIEW-Z, so the point goes to view
  // space; −z is its forward depth. ⛔ No target ⇒ no depth of field, said once — never a guessed distance.
  if (!focusPoint) {
    if (!_warnedNoFocus) { _warnedNoFocus = true; console.error('[dof] no focus point (no controls target) — depth of field is off') }
    _dofRefs.maxBlur.current = 0
    _dofRefs.heroBlur.current = 0
    return
  }
  _heroVec.copy(focusPoint).applyMatrix4(camera.matrixWorldInverse)
  _dofRefs.focusDist.current = Math.max(1, -_heroVec.z)
}
