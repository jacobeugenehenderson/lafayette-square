/**
 * dofDriver — the ONE per-frame DoF driver.
 *
 * Resolves the operator's `dof` channel + the live camera into RomanceDoF's
 * `_dofRefs` (the shader's uniforms). Production (PostProcessing.jsx) and
 * Preview (PreviewPostFx.jsx) BOTH call `applyDofFrame` each frame, so the
 * hero-pocket VIEW-Z anchor and the browse (look-down) gate cannot drift
 * between the shipping render and the publish-confidence gate.
 *
 * Why this exists (2026-06-27): Preview previously forked its own URL-param
 * driver that read heroDist ONCE on mount with no per-frame VIEW-Z transform
 * and no look-down gate — so Preview's DoF was frozen and unfaithful, exactly
 * where Preview's whole job is parity (PREVIEW.md §0/§7). One driver, two
 * callers, no second copy to hand-sync (the "one knob, never two copies"
 * doctrine the project applies to STREET_SMOOTH).
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
import { resolveHeroSubject } from '../lib/heroSubject.js'

const _camDir  = new THREE.Vector3()  // reused for the browse (look-down) gate
const _heroVec = new THREE.Vector3()  // reused for the hero-pocket view-Z depth

/**
 * Populate RomanceDoF's `_dofRefs` from the resolved `dof` channel + live
 * camera. Call once per frame from the consumer's useFrame, only when DoF is
 * mounted (cheap, but pointless otherwise).
 *
 * @param camera      the live THREE camera (state.camera / useThree)
 * @param dofChannel  the resolved `dof` channel (override ?? scene.dof ?? default)
 * @param minute      current TOD minute-of-day
 * @param slotMins    TOD slot minutes for the resolver
 * @param archValues  the hero/Arch placement values (for the hero subject)
 * @param heroSubject the authored hero subject (scene.heroSubject / override)
 */
export function applyDofFrame({ camera, dofChannel, minute, slotMins, archValues, heroSubject }) {
  const d = resolveGroupAtMinute(dofChannel, minute, slotMins, DOF_FIELD_KEYS, DOF_FLAT_DEFAULTS)

  // Browse (overhead) camera: kill DoF — from above, the scene sits at ~one
  // depth, so DoF only smears the map. Gate on look-DOWN (not raw height, which
  // also caught the elevated Hero camera and killed DoF in the Hero shot) — it
  // separates Browse (vertical) from Hero/Street (horizontal).
  camera.getWorldDirection(_camDir)
  const browse = _camDir.y < -0.6

  // CoC paint: window.__dofDebug = 1 (green = sharp, red = full blur) → see
  // exactly where the hero pocket lands. (Preview sets this from ?dofDebug=1.)
  _dofRefs.debug.current      = (typeof window !== 'undefined' && window.__dofDebug) ? 1 : 0
  _dofRefs.nearFocus.current  = d.focus                              // near sharp distance
  _dofRefs.maxBlur.current    = browse ? 0 : d.blur                  // mid/far melt
  _dofRefs.heroBlur.current   = browse ? 0 : (d.heroBlur ?? DOF_FLAT_DEFAULTS.heroBlur)
  _dofRefs.sharpWidth.current = 30 - d.softness * 20                 // softer → wider near feather
  _dofRefs.midRange.current   = 100 + d.softness * 350               // softer → gentler ramp

  // Anchor the hero pocket to the AUTHORED hero, measured from the CAMERA each
  // frame. The shader decodes `dist` as VIEW-Z (depth along the camera's forward
  // axis), NOT Euclidean — so an off-axis hero (the Arch sits to the side of
  // where the camera points) must anchor in the same space, or the pocket misses
  // it. Transform the hero point into view space; -z is that forward depth.
  const heroPt = resolveHeroSubject(heroSubject, { archValues })
  _heroVec.set(heroPt[0], heroPt[1], heroPt[2]).applyMatrix4(camera.matrixWorldInverse)
  _dofRefs.heroDist.current   = -_heroVec.z
}
