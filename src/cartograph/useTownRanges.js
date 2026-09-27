/**
 * useTownRanges — the live derived maxima (src/lib/townRange.js) for Stage's metre sliders.
 * Re-renders only when a rounded maximum changes, never per camera frame.
 */
import { useEffect, useState } from 'react'
import useCartographStore, { activeChannel } from './stores/useCartographStore.js'
import useTimeOfDay from '../hooks/useTimeOfDay'
import { resolveGroupAtMinute, getTodSlotMinutes } from './animatedParam.js'
import { SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS } from './skyLightChannels.js'
import { cameraState, subscribeCameraState } from '../stage/cameraBridge.js'
import { townRanges } from '../lib/townRange.js'

export default function useTownRanges() {
  const boundary = useCartographStore(s => s.sceneBoundary)
  const shadow = useCartographStore(s => activeChannel(s, 'shadow'))
  const minute = useTimeOfDay(s => s.getMinuteOfDay())
  const now = useTimeOfDay(s => s.currentTime)
  const samples = resolveGroupAtMinute(shadow, minute, getTodSlotMinutes(now), SHADOW_FIELD_KEYS, SHADOW_FLAT_DEFAULTS).samples

  const compute = () => townRanges({
    boundary,
    camera: cameraState,
    aspect: typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1,
    fov: cameraState.fov,
    samples,
  })
  const [ranges, setRanges] = useState(compute)
  useEffect(() => {
    const update = () => setRanges(prev => {
      const next = compute()
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
    })
    update()
    return subscribeCameraState(update)
  }, [boundary, samples])   // eslint-disable-line react-hooks/exhaustive-deps
  return ranges
}
