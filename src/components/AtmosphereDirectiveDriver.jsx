/**
 * <AtmosphereDirectiveDriver /> — Phase 5a runtime glue.
 *
 * Mounted once inside the Canvas (Scene.jsx + CanaryScene + PreviewApp).
 *   - Calls useAtmosphereDirective() to compute the live directive from
 *     weather + time + operator override and push it to useAtmosphere.rawDirective.
 *   - Each frame, lerps the previously-tweened directive toward
 *     rawDirective using easeInOutCubic over TWEEN_DURATION_MS. Writes
 *     the interpolated result to useAtmosphere.tweenedDirective; that's
 *     what Atmosphere uniforms + InstancedTrees sway subscribe to.
 *
 * Cloud preset crossfade strategy: WEIGHT UNION. When the rule flips
 * preset (e.g. cumulus_humilis → nimbostratus), the tweened blend
 * carries both presets — old weights * (1-t), new weights * t — so the
 * morphology morphs smoothly instead of snapping.
 *
 * Returns null — pure driver, no rendered output.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import useAtmosphere from '../hooks/useAtmosphere.js'
import useAtmosphereDirective, { getPresetsCache } from '../hooks/useAtmosphereDirective.js'
import useSkyState from '../hooks/useSkyState.js'
import { deriveSkyScalars } from '../lib/sky-scalars.js'
import { lerpDirective } from '../lib/directive-blend.js'
import { easeInOutCubic } from '../lib/ease.js'

// ⭐ The sky's weather numbers ride the SAME tweened directive the rain reads, so the
// lights, dome and exposure cannot part ways with the precipitation (`lib/sky-scalars.js`).
function publishTweened(directive) {
  useAtmosphere.setState({ tweenedDirective: directive })
  useSkyState.getState().setSkyScalars(deriveSkyScalars(directive, getPresetsCache()))
}

const TWEEN_DURATION_MS = 45000  // 45s. Reads as "weather changing", not "scene cut".




export default function AtmosphereDirectiveDriver({ lookId }) {
  useAtmosphereDirective(lookId)

  const lerpStartMs = useRef(null)
  const lerpFromDirective = useRef(null)
  const lastRawRef = useRef(null)

  useFrame(({ clock }) => {
    const raw = useAtmosphere.getState().rawDirective
    if (!raw) return
    const tweened = useAtmosphere.getState().tweenedDirective
    if (!tweened) {
      // Cold start — no prior state to interpolate from. Snap (and take a pending one with it).
      publishTweened(raw)
      lastRawRef.current = raw
      if (useAtmosphere.getState().snapPending) useAtmosphere.setState((s) => ({ snapPending: false, snapEpoch: s.snapEpoch + 1 }))
      return
    }
    if (raw !== lastRawRef.current && useAtmosphere.getState().snapPending) {
      // An operator chose this weather (Stage's switch): land on it now, don't ease, and
      // tell every accumulated-weather holder to drop what the last weather left.
      publishTweened(raw)
      lastRawRef.current = raw
      lerpStartMs.current = null
      useAtmosphere.setState((s) => ({ snapPending: false, snapEpoch: s.snapEpoch + 1 }))
      return
    }
    if (raw !== lastRawRef.current) {
      // New target — capture the present tween position as the start.
      lerpStartMs.current = clock.elapsedTime * 1000
      lerpFromDirective.current = tweened
      lastRawRef.current = raw
    }
    if (lerpStartMs.current != null) {
      const elapsed = clock.elapsedTime * 1000 - lerpStartMs.current
      const t = Math.min(1, elapsed / TWEEN_DURATION_MS)
      const eased = easeInOutCubic(t)
      const next = lerpDirective(lerpFromDirective.current, raw, eased)
      publishTweened(next)
      if (t >= 1) lerpStartMs.current = null
    }
  })

  return null
}
